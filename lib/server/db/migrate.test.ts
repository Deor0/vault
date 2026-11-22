import { copyFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "@/tests/support/db";
import { createTestUser } from "@/tests/support/users";
import { registerUser } from "../auth/users";
import { migrate, MIGRATIONS_DIR } from "./migrate";

let db: TestDb;

beforeEach(async () => {
  db = await createTestDb();
});

afterEach(async () => {
  await db.close();
});

async function insertItem(userId: string | null, plaidItemId = "plaid-item-1") {
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO plaid_items (user_id, plaid_item_id, access_token_ciphertext) VALUES ($1, $2, 'c') RETURNING id`,
    [userId, plaidItemId],
  );
  return rows[0].id;
}

describe("schema", () => {
  it("records every migration and is safe to re-run", async () => {
    const { rows } = await db.query<{ name: string }>("SELECT name FROM schema_migrations ORDER BY name");
    expect(rows.map((row) => row.name)).toEqual(["0001_init.sql", "0002_users.sql"]);
    expect(await migrate(db)).toEqual([]);
  });

  it("has user ownership columns on Plaid data", async () => {
    const { rows } = await db.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.columns
       WHERE column_name = 'user_id' AND table_schema = 'public' ORDER BY table_name`,
    );
    expect(rows.map((row) => row.table_name)).toEqual(["accounts", "plaid_items", "transactions"]);
  });

  it("keeps emails unique and normalized", async () => {
    await createTestUser(db, "me@example.com");
    await expect(createTestUser(db, "me@example.com")).rejects.toThrow();
    await expect(createTestUser(db, "Me@Example.com")).rejects.toThrow();
  });

  it("rejects an account whose owner differs from its Item's owner", async () => {
    const alice = await createTestUser(db, "alice@example.com");
    const bob = await createTestUser(db, "bob@example.com");
    const itemId = await insertItem(alice);
    await expect(
      db.query(
        `INSERT INTO accounts (item_id, user_id, plaid_account_id, name, type) VALUES ($1, $2, 'acc', 'X', 'depository')`,
        [itemId, bob],
      ),
    ).rejects.toThrow();
  });

  it("deletes a user's Plaid data with the user", async () => {
    const alice = await createTestUser(db, "alice@example.com");
    const itemId = await insertItem(alice);
    await db.query(
      `INSERT INTO accounts (item_id, user_id, plaid_account_id, name, type) VALUES ($1, $2, 'acc', 'X', 'depository')`,
      [itemId, alice],
    );
    await db.query("DELETE FROM users WHERE id = $1", [alice]);
    const { rows } = await db.query("SELECT 1 FROM plaid_items UNION ALL SELECT 1 FROM accounts");
    expect(rows).toHaveLength(0);
  });
});

describe("upgrading a database that already has Plaid data", () => {
  let dir: string;
  let legacy: TestDb;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "vault-migrations-"));
    await copyFile(path.join(MIGRATIONS_DIR, "0001_init.sql"), path.join(dir, "0001_init.sql"));
    legacy = await createTestDb(dir);
  });

  afterEach(async () => {
    await legacy.close();
    await rm(dir, { recursive: true, force: true });
  });

  it("keeps existing rows, unowned and invisible, until the first user claims them", async () => {
    await legacy.query(
      `INSERT INTO plaid_items (plaid_item_id, access_token_ciphertext) VALUES ('plaid-item-old', 'c')`,
    );

    await copyFile(path.join(MIGRATIONS_DIR, "0002_users.sql"), path.join(dir, "0002_users.sql"));
    expect(await migrate(legacy, dir)).toEqual(["0002_users.sql"]);
    const select = "SELECT plaid_item_id, user_id FROM plaid_items";
    expect((await legacy.query(select)).rows).toEqual([{ plaid_item_id: "plaid-item-old", user_id: null }]);

    const result = await registerUser(legacy, { email: "first@example.com", password: "first password" });
    if (result.status !== "created") throw new Error("expected a new user");
    expect((await legacy.query(select)).rows).toEqual([{ plaid_item_id: "plaid-item-old", user_id: result.user.id }]);
  });
});
