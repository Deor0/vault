import { Pool, type PoolConfig } from "pg";
import type { Db, Queryable, Row } from "./types";

/** Wrap a node-postgres Pool in the app's `Db` interface. */
export function createPgDb(config: PoolConfig): Db & { end(): Promise<void> } {
  // A connect timeout keeps requests from waiting indefinitely on an unreachable host.
  const pool = new Pool({ max: 5, connectionTimeoutMillis: 5000, ...config });

  const query: Queryable["query"] = async <R extends Row = Row>(text: string, params?: unknown[]) => {
    const result = await pool.query(text, params);
    return { rows: result.rows as R[] };
  };

  return {
    query,
    async transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T> {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const tx: Queryable = {
          query: async <R extends Row = Row>(text: string, params?: unknown[]) => {
            const result = await client.query(text, params);
            return { rows: result.rows as R[] };
          },
        };
        const value = await fn(tx);
        await client.query("COMMIT");
        return value;
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }
    },
    end: () => pool.end(),
  };
}
