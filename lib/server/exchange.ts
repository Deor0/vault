import type { Plaid } from "plaid";
import { encryptSecret } from "./crypto";
import type { Deps } from "./deps";
import { plaidErrorInfo } from "./plaid/client";
import { insertItem, upsertAccounts } from "./repo";
import { syncItem, type SyncResult } from "./sync";
import type { Queryable } from "./db/types";

export type ExchangeResult =
  | { status: "linked"; itemId: string; sync: SyncResult }
  /** The bank login was already linked; the new duplicate Item was removed. */
  | { status: "duplicate"; existingItemId: string };

export interface InstitutionHint {
  id?: string | null;
  name?: string | null;
}

/**
 * Exchange a Link public_token for an access_token and store the new Item.
 *
 * The access_token is encrypted before it touches the database and is never
 * returned. If the same bank login is already linked, the newly created
 * duplicate Item is removed and the existing one is reported instead. If
 * storing fails after the exchange, the new Item is removed so no orphaned
 * Item lingers at Plaid.
 */
export async function exchangePublicToken(
  deps: Pick<Deps, "db" | "plaid" | "encryptionKey">,
  publicToken: string,
  institutionHint: InstitutionHint = {},
): Promise<ExchangeResult> {
  const { db, plaid } = deps;
  const exchange = await plaid.exchangePublicToken(publicToken);
  const accessToken = exchange.access_token;

  let itemId: string;
  try {
    const accountsResponse = await plaid.getAccounts(accessToken);
    const institutionId = accountsResponse.item.institution_id ?? institutionHint.id ?? null;
    const institutionName = accountsResponse.item.institution_name ?? institutionHint.name ?? null;

    const duplicateOf = await findDuplicateItem(db, institutionId, exchange.item_id, accountsResponse.accounts);
    if (duplicateOf) {
      await removeItemQuietly(plaid, accessToken);
      return { status: "duplicate", existingItemId: duplicateOf };
    }

    itemId = await db.transaction(async (tx) => {
      const id = await insertItem(tx, {
        plaidItemId: exchange.item_id,
        accessTokenCiphertext: encryptSecret(accessToken, deps.encryptionKey, exchange.item_id),
        institutionId,
        institutionName,
      });
      await upsertAccounts(tx, id, accountsResponse.accounts);
      return id;
    });
  } catch (error) {
    await removeItemQuietly(plaid, accessToken);
    throw error;
  }

  // The Item is stored; a failed first sync is reported, not fatal. Plaid may
  // still be pulling history, and "Refresh" retries later.
  let sync: SyncResult;
  try {
    sync = await syncItem(deps, itemId);
  } catch (error) {
    sync = { itemId, status: "error", errorCode: plaidErrorInfo(error)?.errorCode ?? null };
  }
  return { status: "linked", itemId, sync };
}

/**
 * An Item duplicates an existing one when it is at the same institution and
 * shares an account (same mask, name, and type). Plaid recommends this check
 * because the same login linked twice is billed twice.
 */
async function findDuplicateItem(
  db: Queryable,
  institutionId: string | null,
  plaidItemId: string,
  accounts: Plaid.AccountBase[],
): Promise<string | null> {
  if (!institutionId) return null;
  const { rows } = await db.query<{ item_id: string; mask: string | null; name: string; type: string }>(
    `SELECT i.id AS item_id, a.mask, a.name, a.type
     FROM plaid_items i JOIN accounts a ON a.item_id = i.id
     WHERE i.institution_id = $1 AND i.plaid_item_id <> $2`,
    [institutionId, plaidItemId],
  );
  for (const existing of rows) {
    const match = accounts.some(
      (account) =>
        (account.mask ?? null) === existing.mask && account.name === existing.name && account.type === existing.type,
    );
    if (match) return existing.item_id;
  }
  return null;
}

async function removeItemQuietly(plaid: Deps["plaid"], accessToken: string): Promise<void> {
  try {
    await plaid.removeItem(accessToken);
  } catch (error) {
    const info = plaidErrorInfo(error);
    console.error(`Failed to remove Plaid item: ${info?.errorCode ?? "unknown error"}`);
  }
}
