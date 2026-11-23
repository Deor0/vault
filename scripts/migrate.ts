import { createPgDb } from "../lib/server/db/pg";
import { migrate } from "../lib/server/db/migrate";
import { readMigrationDatabaseUrl } from "../lib/server/env";

async function main() {
  const db = createPgDb({ connectionString: readMigrationDatabaseUrl() });
  try {
    const applied = await migrate(db);
    console.log(applied.length ? `Applied: ${applied.join(", ")}` : "Database is up to date.");
  } finally {
    await db.end();
  }
}

main().catch((error: unknown) => {
  console.error(`Migration failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
