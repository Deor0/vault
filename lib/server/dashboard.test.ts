import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "@/tests/support/db";
import { createTestUser } from "@/tests/support/users";
import { ACCESS_TOKEN, createFakePlaid, makeSyncPage, makeTransaction } from "@/tests/support/plaid";
import { getItemsWithAccounts, getRecentTransactions } from "./dashboard";
import { exchangePublicToken } from "./exchange";

let db: TestDb;
let userId: string;

beforeEach(async () => {
  db = await createTestDb();
  userId = await createTestUser(db);
});

afterEach(async () => {
  await db.close();
});

describe("dashboard read models", () => {
  it("is empty before anything is linked", async () => {
    expect(await getItemsWithAccounts(db, userId)).toEqual([]);
    expect(await getRecentTransactions(db, userId)).toEqual([]);
  });

  it("lists Items with balances and recent transactions newest first, without secrets", async () => {
    const plaid = createFakePlaid();
    plaid.syncTransactions.mockResolvedValueOnce(
      makeSyncPage({
        added: [
          makeTransaction({ transaction_id: "old", date: "2026-10-01", amount: 5 }),
          makeTransaction({ transaction_id: "new", date: "2026-11-02", amount: -1000, name: "Payroll", merchant_name: null }),
        ],
      }),
    );
    await exchangePublicToken({ db, plaid, encryptionKey: randomBytes(32) }, userId, "public-token");

    const items = await getItemsWithAccounts(db, userId);
    const transactions = await getRecentTransactions(db, userId);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      institutionName: "First Platypus Bank",
      status: "active",
      accounts: [{ name: "Plaid Checking", mask: "0000", currentBalance: 110, availableBalance: 100, currency: "USD" }],
    });
    expect(items[0].lastSyncedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
    expect(transactions.map((t) => [t.date, t.name, t.amount])).toEqual([
      ["2026-11-02", "Payroll", -1000],
      ["2026-10-01", "Coffee Shop", 5],
    ]);
    const serialized = JSON.stringify({ items, transactions });
    expect(serialized).not.toContain(ACCESS_TOKEN);
    expect(serialized).not.toContain("v1:");
  });

  it("limits the number of transactions", async () => {
    const plaid = createFakePlaid();
    plaid.syncTransactions.mockResolvedValueOnce(
      makeSyncPage({
        added: Array.from({ length: 5 }, (_, i) => makeTransaction({ transaction_id: `t${i}` })),
      }),
    );
    await exchangePublicToken({ db, plaid, encryptionKey: randomBytes(32) }, userId, "public-token");
    expect(await getRecentTransactions(db, userId, 3)).toHaveLength(3);
  });

  it("shows each user only their own Items, accounts, and transactions", async () => {
    const plaid = createFakePlaid();
    plaid.syncTransactions.mockResolvedValueOnce(makeSyncPage({ added: [makeTransaction()] }));
    await exchangePublicToken({ db, plaid, encryptionKey: randomBytes(32) }, userId, "public-token");

    const other = await createTestUser(db, "someone-else@example.com");
    expect(await getItemsWithAccounts(db, other)).toEqual([]);
    expect(await getRecentTransactions(db, other)).toEqual([]);
    expect(await getItemsWithAccounts(db, userId)).toHaveLength(1);
    expect(await getRecentTransactions(db, userId)).toHaveLength(1);
  });
});
