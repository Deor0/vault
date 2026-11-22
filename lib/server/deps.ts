import type { Db } from "./db/types";
import type { PlaidApi } from "./plaid/client";

/** Everything the server-side Plaid flows need; injected so tests can fake Plaid and the database. */
export interface Deps {
  db: Db;
  plaid: PlaidApi;
  /** 32-byte AES key used to encrypt access tokens at rest. */
  encryptionKey: Buffer;
  /** Optional OAuth redirect URI passed to /link/token/create. */
  redirectUri?: string;
}

/** Stable id for the single local user; Plaid requires a client_user_id per Link session. */
export const CLIENT_USER_ID = "vault-local-user";
