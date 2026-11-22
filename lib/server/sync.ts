import type { Plaid } from "plaid";
import { decryptSecret } from "./crypto";
import type { Deps } from "./deps";
import { NotFoundError } from "./errors";
import { plaidErrorInfo, requiresUpdateMode, type PlaidApi } from "./plaid/client";
import {
  deleteTransactions,
  getItem,
  listItems,
  setItemStatus,
  upsertAccounts,
  upsertTransactions,
} from "./repo";

export type SyncResult =
  | {
      itemId: string;
      status: "synced";
      accounts: number;
      added: number;
      modified: number;
      removed: number;
    }
  /** The Item needs re-authentication through update-mode Link. */
  | { itemId: string; status: "login_required"; errorCode: string }
  /** Another sync advanced the cursor first; its changes are already stored. */
  | { itemId: string; status: "conflict" }
  | { itemId: string; status: "error"; errorCode: string | null };

const MAX_PAGINATION_RESTARTS = 3;
const MAX_PAGES = 1000;

/**
 * Page through /transactions/sync from `cursor` until `has_more` is false.
 * If Plaid reports the data changed mid-pagination, restart from the original
 * cursor, as Plaid's docs require.
 */
export async function fetchTransactionUpdates(
  plaid: PlaidApi,
  accessToken: string,
  cursor: string | null,
): Promise<{ pages: Plaid.TransactionsSyncResponse[]; nextCursor: string }> {
  for (let attempt = 0; ; attempt++) {
    const pages: Plaid.TransactionsSyncResponse[] = [];
    let pageCursor = cursor || undefined;
    try {
      for (;;) {
        const page = await plaid.syncTransactions(accessToken, pageCursor);
        pages.push(page);
        pageCursor = page.next_cursor;
        if (!page.has_more) return { pages, nextCursor: page.next_cursor };
        if (pages.length >= MAX_PAGES) throw new Error("transactions/sync returned too many pages");
      }
    } catch (error) {
      const info = plaidErrorInfo(error);
      if (
        info?.errorCode === "TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION" &&
        attempt < MAX_PAGINATION_RESTARTS
      ) {
        continue;
      }
      throw error;
    }
  }
}

/**
 * Refresh one Item: upsert accounts and balances from /accounts/get, then
 * apply /transactions/sync changes from the stored cursor. Transaction
 * changes and the new cursor are committed atomically, so a failure part-way
 * leaves the old cursor and the next sync replays the same changes; upserts
 * keyed on Plaid ids make that replay idempotent.
 */
export async function syncItem(deps: Pick<Deps, "db" | "plaid" | "encryptionKey">, itemId: string): Promise<SyncResult> {
  const { db, plaid } = deps;
  const item = await getItem(db, itemId);
  if (!item) throw new NotFoundError("Linked item not found");
  const accessToken = decryptSecret(item.access_token_ciphertext, deps.encryptionKey, item.plaid_item_id);
  const startCursor = item.transactions_cursor;

  try {
    const accountsResponse = await plaid.getAccounts(accessToken);
    await upsertAccounts(db, item.id, accountsResponse.accounts);

    const { pages, nextCursor } = await fetchTransactionUpdates(plaid, accessToken, startCursor);

    const counts = { added: 0, modified: 0, removed: 0 };
    const applied = await db.transaction(async (tx) => {
      const { rows } = await tx.query<{ transactions_cursor: string | null }>(
        "SELECT transactions_cursor FROM plaid_items WHERE id = $1 FOR UPDATE",
        [item.id],
      );
      if (rows.length === 0 || rows[0].transactions_cursor !== startCursor) return false;

      for (const page of pages) {
        // Accounts can appear in sync results before /accounts/get returns
        // them; insert any missing ones without overwriting fresher balances.
        await upsertAccounts(tx, item.id, page.accounts ?? [], { overwrite: false });
        await upsertTransactions(tx, item.id, page.added);
        await upsertTransactions(tx, item.id, page.modified);
        await deleteTransactions(
          tx,
          item.id,
          page.removed.map((removed) => removed.transaction_id),
        );
        counts.added += page.added.length;
        counts.modified += page.modified.length;
        counts.removed += page.removed.length;
      }

      await tx.query(
        `UPDATE plaid_items SET transactions_cursor = $2, last_synced_at = now(), status = 'active',
           error_code = NULL, updated_at = now() WHERE id = $1`,
        [item.id, nextCursor],
      );
      return true;
    });

    if (!applied) return { itemId: item.id, status: "conflict" };
    return { itemId: item.id, status: "synced", accounts: accountsResponse.accounts.length, ...counts };
  } catch (error) {
    const info = plaidErrorInfo(error);
    if (requiresUpdateMode(info)) {
      await setItemStatus(db, item.id, "login_required", info!.errorCode);
      return { itemId: item.id, status: "login_required", errorCode: info!.errorCode };
    }
    throw error;
  }
}

/** Sync every linked Item. One Item failing does not stop the others. */
export async function syncAllItems(deps: Pick<Deps, "db" | "plaid" | "encryptionKey">): Promise<SyncResult[]> {
  const items = await listItems(deps.db);
  const results: SyncResult[] = [];
  for (const item of items) {
    try {
      results.push(await syncItem(deps, item.id));
    } catch (error) {
      const info = plaidErrorInfo(error);
      // Log only Plaid's error code / request id: SDK errors can carry request
      // details, and access tokens must never reach the logs.
      console.error(
        `Sync failed for item ${item.id}: ${info ? `${info.errorCode} (request ${info.requestId ?? "n/a"})` : describeError(error)}`,
      );
      if (info) await setItemStatus(deps.db, item.id, "error", info.errorCode).catch(() => undefined);
      results.push({ itemId: item.id, status: "error", errorCode: info?.errorCode ?? null });
    }
  }
  return results;
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.name : "unknown error";
}
