import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "@/tests/support/db";
import { createTestUser } from "@/tests/support/users";
import {
  ACCESS_TOKEN,
  createFakePlaid,
  makeAccountsResponse,
  makeSyncPage,
  makeTransaction,
  plaidApiError,
  type FakePlaid,
} from "@/tests/support/plaid";
import { decryptSecret } from "./crypto";
import { exchangePublicToken } from "./exchange";
import { listItems } from "./repo";

let db: TestDb;
let userId: string;
let plaid: FakePlaid;
const encryptionKey = randomBytes(32);

beforeEach(async () => {
  db = await createTestDb();
  userId = await createTestUser(db);
  plaid = createFakePlaid();
});

afterEach(async () => {
  await db.close();
});

describe("exchangePublicToken", () => {
  it("stores the Item with an encrypted access token, its accounts, and an initial sync", async () => {
    plaid.syncTransactions.mockResolvedValueOnce(
      makeSyncPage({ added: [makeTransaction({ transaction_id: "t1" })], next_cursor: "c1" }),
    );

    const result = await exchangePublicToken({ db, plaid, encryptionKey }, userId, "public-sandbox-token");

    expect(plaid.exchangePublicToken).toHaveBeenCalledWith("public-sandbox-token");
    expect(result).toMatchObject({ status: "linked", sync: { status: "synced", added: 1 } });
    expect(JSON.stringify(result)).not.toContain(ACCESS_TOKEN);

    const [item] = await listItems(db, userId);
    expect(item.plaid_item_id).toBe("plaid-item-1");
    expect(item.institution_name).toBe("First Platypus Bank");
    expect(item.access_token_ciphertext).not.toContain(ACCESS_TOKEN);
    expect(decryptSecret(item.access_token_ciphertext, encryptionKey, "plaid-item-1")).toBe(ACCESS_TOKEN);
    expect(item.transactions_cursor).toBe("c1");

    const { rows } = await db.query("SELECT plaid_account_id FROM accounts");
    expect(rows).toEqual([{ plaid_account_id: "acc-checking" }]);
  });

  it("never persists the plaintext access token anywhere", async () => {
    await exchangePublicToken({ db, plaid, encryptionKey }, userId, "public-sandbox-token");
    const { rows } = await db.query<{ dump: string }>(
      `SELECT (SELECT json_agg(p)::text FROM plaid_items p) || (SELECT json_agg(a)::text FROM accounts a) AS dump`,
    );
    expect(rows[0].dump).not.toContain(ACCESS_TOKEN);
  });

  it("falls back to Link metadata for the institution name", async () => {
    plaid.getAccounts.mockResolvedValue(
      makeAccountsResponse(undefined, { institution_id: null, institution_name: null }),
    );
    await exchangePublicToken({ db, plaid, encryptionKey }, userId, "public-sandbox-token", {
      id: "ins_1",
      name: "Hinted Bank",
    });
    const [item] = await listItems(db, userId);
    expect(item).toMatchObject({ institution_id: "ins_1", institution_name: "Hinted Bank" });
  });

  it("removes a duplicate Item for an already-linked login", async () => {
    const first = await exchangePublicToken({ db, plaid, encryptionKey }, userId, "public-1");
    plaid.exchangePublicToken.mockResolvedValueOnce({
      access_token: "access-sandbox-duplicate",
      item_id: "plaid-item-2",
      request_id: "req",
    });

    const second = await exchangePublicToken({ db, plaid, encryptionKey }, userId, "public-2");

    expect(second).toEqual({ status: "duplicate", existingItemId: first.status === "linked" ? first.itemId : "" });
    expect(plaid.removeItem).toHaveBeenCalledWith("access-sandbox-duplicate");
    expect(await listItems(db, userId)).toHaveLength(1);
  });

  it("removes the new Item at Plaid if storing it fails", async () => {
    await db.query("DROP TABLE accounts CASCADE");
    await expect(exchangePublicToken({ db, plaid, encryptionKey }, userId, "public-sandbox-token")).rejects.toThrow();
    expect(plaid.removeItem).toHaveBeenCalledWith(ACCESS_TOKEN);
  });

  it("propagates an invalid public token without touching the database", async () => {
    plaid.exchangePublicToken.mockRejectedValueOnce(plaidApiError("INVALID_PUBLIC_TOKEN", "INVALID_INPUT"));
    await expect(exchangePublicToken({ db, plaid, encryptionKey }, userId, "bad")).rejects.toMatchObject({
      body: { error_code: "INVALID_PUBLIC_TOKEN" },
    });
    expect(plaid.removeItem).not.toHaveBeenCalled();
    expect(await listItems(db, userId)).toHaveLength(0);
  });

  it("keeps the Item when the first sync fails", async () => {
    plaid.syncTransactions.mockRejectedValueOnce(plaidApiError("PRODUCT_NOT_READY", "ITEM_ERROR"));
    const result = await exchangePublicToken({ db, plaid, encryptionKey }, userId, "public-sandbox-token");
    expect(result).toMatchObject({ status: "linked", sync: { status: "error", errorCode: "PRODUCT_NOT_READY" } });
    expect(await listItems(db, userId)).toHaveLength(1);
    expect(plaid.removeItem).not.toHaveBeenCalled();
  });
});
