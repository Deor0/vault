/**
 * Minimal database interface shared by the app (node-postgres) and the tests
 * (PGlite, an in-process Postgres). Keeping it this small lets the same SQL run
 * against both.
 */

export type Row = Record<string, unknown>;

export interface Queryable {
  query<R extends Row = Row>(text: string, params?: unknown[]): Promise<{ rows: R[] }>;
}

export interface Db extends Queryable {
  /** Run `fn` inside a single transaction; commits on success, rolls back on throw. */
  transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T>;
}
