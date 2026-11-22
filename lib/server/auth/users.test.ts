import bcrypt from "bcryptjs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "@/tests/support/db";
import { createTestUser, TEST_PASSWORD } from "@/tests/support/users";
import { fieldErrors, registerUser, signUpSchema, verifyCredentials } from "./users";

let db: TestDb;

beforeEach(async () => {
  db = await createTestDb();
});

afterEach(async () => {
  await db.close();
});

/** An Item with one account and one transaction and no owner, as linked before Vault had accounts. */
async function seedUnownedItem(plaidItemId = "plaid-item-legacy") {
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO plaid_items (plaid_item_id, access_token_ciphertext) VALUES ($1, 'ciphertext') RETURNING id`,
    [plaidItemId],
  );
  const itemId = rows[0].id;
  const account = await db.query<{ id: string }>(
    `INSERT INTO accounts (item_id, plaid_account_id, name, type) VALUES ($1, $2, 'Checking', 'depository') RETURNING id`,
    [itemId, `${plaidItemId}-acc`],
  );
  await db.query(
    `INSERT INTO transactions (item_id, account_id, plaid_transaction_id, amount, date, name)
     VALUES ($1, $2, $3, 1.5, '2026-11-01', 'Coffee')`,
    [itemId, account.rows[0].id, `${plaidItemId}-txn`],
  );
  return itemId;
}

async function owners() {
  const { rows } = await db.query<{ table: string; user_id: string | null }>(
    `SELECT 'plaid_items' AS table, user_id FROM plaid_items
     UNION ALL SELECT 'accounts', user_id FROM accounts
     UNION ALL SELECT 'transactions', user_id FROM transactions`,
  );
  return rows;
}

describe("signUpSchema", () => {
  function errorsFor(input: Record<string, unknown>) {
    const parsed = signUpSchema.safeParse(input);
    return parsed.success ? {} : fieldErrors(parsed.error);
  }

  it("normalizes the email and drops a blank name", () => {
    const parsed = signUpSchema.parse({
      name: "  ",
      email: "  Me@Example.COM ",
      password: "long enough",
      confirmPassword: "long enough",
    });
    expect(parsed).toEqual({ email: "me@example.com", password: "long enough", confirmPassword: "long enough" });
  });

  it("explains each invalid field", () => {
    expect(errorsFor({ email: "not-an-email", password: "short", confirmPassword: "short" })).toEqual({
      email: "Enter a valid email address",
      password: "Use at least 8 characters",
    });
    expect(errorsFor({ email: "", password: "", confirmPassword: "" })).toMatchObject({
      email: "Enter your email address",
    });
    expect(errorsFor({ email: "a@b.co", password: "long enough", confirmPassword: "different" })).toEqual({
      confirmPassword: "Passwords do not match",
    });
  });

  it("rejects passwords bcrypt would truncate", () => {
    const password = "é".repeat(37); // 74 bytes
    expect(errorsFor({ email: "a@b.co", password, confirmPassword: password })).toEqual({
      password: "That password is too long",
    });
  });
});

describe("verifyCredentials (Credentials authorize)", () => {
  it("returns the user for the right email and password, ignoring email case", async () => {
    const id = await createTestUser(db, "owner@example.com");
    expect(await verifyCredentials(db, { email: "Owner@Example.com", password: TEST_PASSWORD })).toEqual({
      id,
      email: "owner@example.com",
      name: null,
    });
  });

  it("returns null for a wrong password, an unknown email, or malformed input", async () => {
    await createTestUser(db, "owner@example.com");
    expect(await verifyCredentials(db, { email: "owner@example.com", password: "wrong password" })).toBeNull();
    expect(await verifyCredentials(db, { email: "nobody@example.com", password: TEST_PASSWORD })).toBeNull();
    expect(await verifyCredentials(db, { email: "owner@example.com" })).toBeNull();
    expect(await verifyCredentials(db, { email: ["owner@example.com"], password: TEST_PASSWORD })).toBeNull();
    expect(await verifyCredentials(db, undefined)).toBeNull();
  });
});

describe("registerUser", () => {
  it("stores a bcrypt hash, never the password", async () => {
    const result = await registerUser(db, { email: "me@example.com", password: "s3cret-password", name: "Me" });
    expect(result).toMatchObject({ status: "created", user: { email: "me@example.com", name: "Me" } });
    const { rows } = await db.query<{ password_hash: string }>("SELECT password_hash FROM users");
    expect(rows[0].password_hash).not.toContain("s3cret-password");
    expect(await bcrypt.compare("s3cret-password", rows[0].password_hash)).toBe(true);
    expect(await verifyCredentials(db, { email: "me@example.com", password: "s3cret-password" })).not.toBeNull();
  });

  it("reports an email that is already registered", async () => {
    await registerUser(db, { email: "me@example.com", password: "first password" });
    expect(await registerUser(db, { email: "me@example.com", password: "second password" })).toEqual({
      status: "email_taken",
    });
    const { rows } = await db.query("SELECT 1 FROM users");
    expect(rows).toHaveLength(1);
  });

  it("gives data linked before accounts existed to the first user only", async () => {
    await seedUnownedItem();
    const first = await registerUser(db, { email: "first@example.com", password: "first password" });
    if (first.status !== "created") throw new Error("expected a new user");
    expect(await owners()).toEqual([
      { table: "plaid_items", user_id: first.user.id },
      { table: "accounts", user_id: first.user.id },
      { table: "transactions", user_id: first.user.id },
    ]);

    // Anything still unowned later (there should be nothing) is not handed to a second user.
    await seedUnownedItem("plaid-item-legacy-2");
    await registerUser(db, { email: "second@example.com", password: "second password" });
    const unowned = (await owners()).filter((row) => row.user_id === null);
    expect(unowned).toHaveLength(3);
  });
});
