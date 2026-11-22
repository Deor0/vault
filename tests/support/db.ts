import { PGlite } from "@electric-sql/pglite";
import { migrate } from "@/lib/server/db/migrate";
import type { Db, Queryable, Row } from "@/lib/server/db/types";

type PGliteLike = Pick<PGlite, "query" | "exec">;

/**
 * Mirror node-postgres: a parameterless query uses the simple protocol (so
 * multi-statement migration files work); otherwise the extended protocol.
 */
function queryable(pg: PGliteLike): Queryable {
  return {
    async query<R extends Row = Row>(text: string, params?: unknown[]) {
      if (params && params.length > 0) {
        const result = await pg.query<R>(text, params);
        return { rows: result.rows };
      }
      const results = await pg.exec(text);
      return { rows: (results.at(-1)?.rows ?? []) as R[] };
    },
  };
}

export interface TestDb extends Db {
  close(): Promise<void>;
}

/** A fresh in-process Postgres (PGlite) with Vault's migrations applied. */
export async function createTestDb(): Promise<TestDb> {
  const pg = new PGlite();
  const db: TestDb = {
    ...queryable(pg),
    transaction: (fn) => pg.transaction((tx) => fn(queryable(tx))),
    close: () => pg.close(),
  };
  await migrate(db);
  return db;
}
