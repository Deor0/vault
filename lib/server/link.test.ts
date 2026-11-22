import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "@/tests/support/db";
import { createTestUser } from "@/tests/support/users";
import { ACCESS_TOKEN, createFakePlaid, plaidApiError, type FakePlaid } from "@/tests/support/plaid";
import { encryptSecret } from "./crypto";
import { NotFoundError } from "./errors";
import { completeUpdateMode, createLinkToken } from "./link";
import { getItem, insertItem, setItemStatus } from "./repo";

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

async function seedItem() {
  return insertItem(db, {
    userId,
    plaidItemId: "plaid-item-1",
    accessTokenCiphertext: encryptSecret(ACCESS_TOKEN, encryptionKey, "plaid-item-1"),
    institutionId: "ins_109508",
    institutionName: "First Platypus Bank",
  });
}

describe("createLinkToken", () => {
  it("creates a new-Item token for transactions", async () => {
    const result = await createLinkToken({ db, plaid, encryptionKey }, userId);
    expect(result).toEqual({ linkToken: "link-sandbox-token", mode: "create" });
    const request = plaid.createLinkToken.mock.calls[0][0];
    expect(request.products).toEqual(["transactions"]);
    expect(request.access_token).toBeUndefined();
    expect(request.country_codes).toEqual(["US"]);
    expect(request.user?.client_user_id).toBe(userId);
  });

  it("uses update mode with the stored access token for an existing Item", async () => {
    const itemId = await seedItem();
    const result = await createLinkToken({ db, plaid, encryptionKey }, userId, { itemId });
    expect(result.mode).toBe("update");
    const request = plaid.createLinkToken.mock.calls[0][0];
    expect(request.access_token).toBe(ACCESS_TOKEN);
    expect(request.products).toBeUndefined();
  });

  it("passes the optional OAuth redirect URI", async () => {
    await createLinkToken({ db, plaid, encryptionKey, redirectUri: "https://localhost:3000/oauth" }, userId);
    expect(plaid.createLinkToken.mock.calls[0][0].redirect_uri).toBe("https://localhost:3000/oauth");
  });

  it("404s for an unknown Item", async () => {
    await expect(
      createLinkToken({ db, plaid, encryptionKey }, userId, { itemId: "00000000-0000-0000-0000-000000000000" }),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(plaid.createLinkToken).not.toHaveBeenCalled();
  });
});

describe("completeUpdateMode", () => {
  it("clears the login-required state and re-syncs without exchanging a token", async () => {
    const itemId = await seedItem();
    await setItemStatus(db, itemId, "login_required", "ITEM_LOGIN_REQUIRED");

    const result = await completeUpdateMode({ db, plaid, encryptionKey }, userId, itemId);

    expect(result.status).toBe("synced");
    expect(plaid.exchangePublicToken).not.toHaveBeenCalled();
    const item = await getItem(db, userId, itemId);
    expect(item?.status).toBe("active");
    expect(item?.error_code).toBeNull();
  });

  it("returns login_required again if the Item still needs attention", async () => {
    const itemId = await seedItem();
    plaid.getAccounts.mockRejectedValueOnce(plaidApiError("ITEM_LOGIN_REQUIRED"));
    const result = await completeUpdateMode({ db, plaid, encryptionKey }, userId, itemId);
    expect(result).toMatchObject({ status: "login_required", errorCode: "ITEM_LOGIN_REQUIRED" });
  });
});
