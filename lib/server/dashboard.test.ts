import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "@/tests/support/db";
import { ACCESS_TOKEN, createFakePlaid, makeSyncPage, makeTransaction } from "@/tests/support/plaid";
import { getDashboard } from "./dashboard";
import { exchangePublicToken } from "./exchange";

let db: TestDb;

beforeEach(async () => {
  db = await createTestDb();
});

afterEach(async () => {
  await db.close();
});

describe("getDashboard", () => {
  it("is empty before anything is linked", async () => {
    expect(await getDashboard(db)).toEqual({ items: [], transactions: [] });
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
    await exchangePublicToken({ db, plaid, encryptionKey: randomBytes(32) }, "public-token");

    const dashboard = await getDashboard(db);

    expect(dashboard.items).toHaveLength(1);
    expect(dashboard.items[0]).toMatchObject({
      institutionName: "First Platypus Bank",
      status: "active",
      accounts: [{ name: "Plaid Checking", mask: "0000", currentBalance: 110, availableBalance: 100, currency: "USD" }],
    });
    expect(dashboard.items[0].lastSyncedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
    expect(dashboard.transactions.map((t) => [t.date, t.name, t.amount])).toEqual([
      ["2026-11-02", "Payroll", -1000],
      ["2026-10-01", "Coffee Shop", 5],
    ]);
    expect(JSON.stringify(dashboard)).not.toContain(ACCESS_TOKEN);
    expect(JSON.stringify(dashboard)).not.toContain("v1:");
  });

  it("limits the number of transactions", async () => {
    const plaid = createFakePlaid();
    plaid.syncTransactions.mockResolvedValueOnce(
      makeSyncPage({
        added: Array.from({ length: 5 }, (_, i) => makeTransaction({ transaction_id: `t${i}` })),
      }),
    );
    await exchangePublicToken({ db, plaid, encryptionKey: randomBytes(32) }, "public-token");
    expect((await getDashboard(db, 3)).transactions).toHaveLength(3);
  });
});
