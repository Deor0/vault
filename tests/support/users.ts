import bcrypt from "bcryptjs";
import type { Queryable } from "@/lib/server/db/types";

export const TEST_PASSWORD = "correct horse battery";

/** Insert a user directly (cheap bcrypt cost) and return its id. */
export async function createTestUser(db: Queryable, email = "owner@example.com"): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    "INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id",
    [email, await bcrypt.hash(TEST_PASSWORD, 4)],
  );
  return rows[0].id;
}
