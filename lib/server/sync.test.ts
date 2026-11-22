import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "@/tests/support/db";
import { createTestUser } from "@/tests/support/users";
import {
  ACCESS_TOKEN,
  createFakePlaid,
  makeAccount,
  makeAccountsResponse,
  makeSyncPage,
  makeTransaction,
  plaidApiError,
  type FakePlaid,
} from "@/tests/support/plaid";
import { encryptSecret } from "./crypto";
import { getItem, insertItem } from "./repo";
import { syncAllItems, syncItem } from "./sync";

let db: TestDb;
let userId: string;
let plaid: FakePlaid;
const encryptionKey = randomBytes(32);
let itemId: string;

async function seedItem(plaidItemId = "plaid-item-1") {
  return insertItem(db, {
    userId,
    plaidItemId,
    accessTokenCiphertext: encryptSecret(ACCESS_TOKEN, encryptionKey, plaidItemId),
    institutionId: "ins_109508",
    institutionName: "First Platypus Bank",
  });
}

async function transactions() {
  const { rows } = await db.query<{ plaid_transaction_id: string; amount: number; pending: boolean; name: string }>(
    "SELECT plaid_transaction_id, amount::float8 AS amount, pending, name FROM transactions ORDER BY plaid_transaction_id",
  );
  return rows;
}

beforeEach(async () => {
  db = await createTestDb();
  userId = await createTestUser(db);
  plaid = createFakePlaid();
  itemId = await seedItem();
});

afterEach(async () => {
  await db.close();
});

describe("syncItem", () => {
  it("upserts accounts with balances and stores transactions and the cursor", async () => {
    plaid.syncTransactions.mockResolvedValueOnce(
      makeSyncPage({
        added: [makeTransaction({ transaction_id: "t1" }), makeTransaction({ transaction_id: "t2", amount: -500 })],
        next_cursor: "cursor-a",
      }),
    );

    const result = await syncItem({ db, plaid, encryptionKey }, userId, itemId);

    expect(result).toEqual({ itemId, status: "synced", accounts: 1, added: 2, modified: 0, removed: 0 });
    expect(plaid.getAccounts).toHaveBeenCalledWith(ACCESS_TOKEN);
    expect(plaid.syncTransactions).toHaveBeenCalledWith(ACCESS_TOKEN, undefined);
    const { rows: accounts } = await db.query<{ current: number; available: number }>(
      "SELECT current_balance::float8 AS current, available_balance::float8 AS available FROM accounts",
    );
    expect(accounts).toEqual([{ current: 110, available: 100 }]);
    expect((await transactions()).map((t) => [t.plaid_transaction_id, t.amount])).toEqual([
      ["t1", 12.5],
      ["t2", -500],
    ]);
    const item = await getItem(db, userId, itemId);
    expect(item?.transactions_cursor).toBe("cursor-a");
  });

  it("follows has_more pagination and resumes from the stored cursor next time", async () => {
    plaid.syncTransactions
      .mockResolvedValueOnce(
        makeSyncPage({ added: [makeTransaction({ transaction_id: "t1" })], has_more: true, next_cursor: "c1" }),
      )
      .mockResolvedValueOnce(makeSyncPage({ added: [makeTransaction({ transaction_id: "t2" })], next_cursor: "c2" }));

    await syncItem({ db, plaid, encryptionKey }, userId, itemId);
    expect(plaid.syncTransactions.mock.calls.map((call) => call[1])).toEqual([undefined, "c1"]);
    expect(await transactions()).toHaveLength(2);

    plaid.syncTransactions.mockResolvedValueOnce(makeSyncPage({ next_cursor: "c3" }));
    await syncItem({ db, plaid, encryptionKey }, userId, itemId);
    expect(plaid.syncTransactions.mock.calls.at(-1)?.[1]).toBe("c2");
    expect((await getItem(db, userId, itemId))?.transactions_cursor).toBe("c3");
  });

  it("applies modified and removed transactions", async () => {
    plaid.syncTransactions.mockResolvedValueOnce(
      makeSyncPage({
        added: [
          makeTransaction({ transaction_id: "t1", pending: true }),
          makeTransaction({ transaction_id: "t2" }),
        ],
        next_cursor: "c1",
      }),
    );
    await syncItem({ db, plaid, encryptionKey }, userId, itemId);

    plaid.syncTransactions.mockResolvedValueOnce(
      makeSyncPage({
        modified: [makeTransaction({ transaction_id: "t1", pending: false, amount: 13, name: "Coffee Shop #2" })],
        removed: [{ transaction_id: "t2", account_id: "acc-checking" }],
        next_cursor: "c2",
      }),
    );
    const result = await syncItem({ db, plaid, encryptionKey }, userId, itemId);

    expect(result).toMatchObject({ status: "synced", added: 0, modified: 1, removed: 1 });
    expect(await transactions()).toEqual([
      { plaid_transaction_id: "t1", amount: 13, pending: false, name: "Coffee Shop #2" },
    ]);
  });

  it("is idempotent when the same changes are replayed", async () => {
    const page = makeSyncPage({ added: [makeTransaction({ transaction_id: "t1" })], next_cursor: "c1" });
    plaid.syncTransactions.mockResolvedValue(page);

    await syncItem({ db, plaid, encryptionKey }, userId, itemId);
    // Simulate a crash before the cursor advanced: Plaid replays the same page.
    await db.query("UPDATE plaid_items SET transactions_cursor = NULL WHERE id = $1", [itemId]);
    await syncItem({ db, plaid, encryptionKey }, userId, itemId);

    expect(await transactions()).toHaveLength(1);
    const { rows } = await db.query<{ count: number }>("SELECT count(*)::int AS count FROM accounts");
    expect(rows[0].count).toBe(1);
  });

  it("updates balances on every sync", async () => {
    await syncItem({ db, plaid, encryptionKey }, userId, itemId);
    plaid.getAccounts.mockResolvedValueOnce(
      makeAccountsResponse([makeAccount({ balances: { ...makeAccount().balances, current: 42, available: 40 } })]),
    );
    await syncItem({ db, plaid, encryptionKey }, userId, itemId);
    const { rows } = await db.query<{ current: number }>("SELECT current_balance::float8 AS current FROM accounts");
    expect(rows).toEqual([{ current: 42 }]);
  });

  it("restarts pagination from the original cursor when Plaid reports a mutation", async () => {
    await db.query("UPDATE plaid_items SET transactions_cursor = 'start' WHERE id = $1", [itemId]);
    plaid.syncTransactions
      .mockResolvedValueOnce(
        makeSyncPage({ added: [makeTransaction({ transaction_id: "stale" })], has_more: true, next_cursor: "p1" }),
      )
      .mockRejectedValueOnce(plaidApiError("TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION", "TRANSACTIONS_ERROR"))
      .mockResolvedValueOnce(makeSyncPage({ added: [makeTransaction({ transaction_id: "fresh" })], next_cursor: "p2" }));

    const result = await syncItem({ db, plaid, encryptionKey }, userId, itemId);

    expect(plaid.syncTransactions.mock.calls.map((call) => call[1])).toEqual(["start", "p1", "start"]);
    expect(result).toMatchObject({ status: "synced", added: 1 });
    expect((await transactions()).map((t) => t.plaid_transaction_id)).toEqual(["fresh"]);
  });

  it("inserts accounts that first appear in transactions/sync", async () => {
    plaid.syncTransactions.mockResolvedValueOnce(
      makeSyncPage({
        accounts: [makeAccount({ account_id: "acc-savings", name: "Plaid Saving", subtype: "savings" })],
        added: [makeTransaction({ transaction_id: "t1", account_id: "acc-savings" })],
      }),
    );
    await syncItem({ db, plaid, encryptionKey }, userId, itemId);
    expect(await transactions()).toHaveLength(1);
  });

  it("does not store anything when a transaction references an unknown account", async () => {
    plaid.syncTransactions.mockResolvedValueOnce(
      makeSyncPage({ added: [makeTransaction({ transaction_id: "t1", account_id: "acc-missing" })] }),
    );
    await expect(syncItem({ db, plaid, encryptionKey }, userId, itemId)).rejects.toThrow(/unknown account/);
    expect(await transactions()).toHaveLength(0);
    expect((await getItem(db, userId, itemId))?.transactions_cursor).toBeNull();
  });

  it("marks the Item login_required when Plaid needs re-authentication", async () => {
    plaid.getAccounts.mockRejectedValueOnce(plaidApiError("ITEM_LOGIN_REQUIRED"));
    const result = await syncItem({ db, plaid, encryptionKey }, userId, itemId);
    expect(result).toEqual({ itemId, status: "login_required", errorCode: "ITEM_LOGIN_REQUIRED" });
    const item = await getItem(db, userId, itemId);
    expect(item?.status).toBe("login_required");
    expect(item?.error_code).toBe("ITEM_LOGIN_REQUIRED");
  });

  it("skips applying changes when another sync already advanced the cursor", async () => {
    plaid.syncTransactions.mockImplementationOnce(async () => {
      // A concurrent refresh commits first.
      await db.query("UPDATE plaid_items SET transactions_cursor = 'other' WHERE id = $1", [itemId]);
      return makeSyncPage({ added: [makeTransaction({ transaction_id: "t1" })], next_cursor: "mine" });
    });
    const result = await syncItem({ db, plaid, encryptionKey }, userId, itemId);
    expect(result).toEqual({ itemId, status: "conflict" });
    expect(await transactions()).toHaveLength(0);
    expect((await getItem(db, userId, itemId))?.transactions_cursor).toBe("other");
  });
});

describe("syncAllItems", () => {
  it("keeps going when one Item fails and reports each result", async () => {
    const second = await seedItem("plaid-item-2");
    plaid.getAccounts
      .mockRejectedValueOnce(plaidApiError("INSTITUTION_DOWN", "INSTITUTION_ERROR"))
      .mockResolvedValueOnce(makeAccountsResponse([makeAccount({ account_id: "acc-2" })]));

    const results = await syncAllItems({ db, plaid, encryptionKey }, userId);

    expect(results).toEqual([
      { itemId, status: "error", errorCode: "INSTITUTION_DOWN" },
      { itemId: second, status: "synced", accounts: 1, added: 0, modified: 0, removed: 0 },
    ]);
    expect((await getItem(db, userId, itemId))?.status).toBe("error");
    expect((await getItem(db, userId, second))?.status).toBe("active");
  });
});
