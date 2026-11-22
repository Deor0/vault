import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { Db } from "./types";

export const MIGRATIONS_DIR = path.join(process.cwd(), "db", "migrations");

/**
 * Apply every `db/migrations/*.sql` file that has not been applied yet, in
 * filename order, each in its own transaction. Returns the names applied.
 */
export async function migrate(db: Db, dir: string = MIGRATIONS_DIR): Promise<string[]> {
  await db.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  const files = (await readdir(dir)).filter((name) => name.endsWith(".sql")).sort();
  const { rows } = await db.query<{ name: string }>("SELECT name FROM schema_migrations");
  const applied = new Set(rows.map((row) => row.name));

  const newlyApplied: string[] = [];
  for (const name of files) {
    if (applied.has(name)) continue;
    const sql = await readFile(path.join(dir, name), "utf8");
    await db.transaction(async (tx) => {
      await tx.query(sql);
      await tx.query("INSERT INTO schema_migrations (name) VALUES ($1)", [name]);
    });
    newlyApplied.push(name);
  }
  return newlyApplied;
}
