import "server-only";
import { attachDatabasePool } from "@vercel/functions";
import { parseEncryptionKey } from "./crypto";
import { createPgDb } from "./db/pg";
import type { Db } from "./db/types";
import type { Deps } from "./deps";
import { readDatabaseUrl, readPlaidConfig } from "./env";
import { createPlaidApi } from "./plaid/client";

/**
 * Process-wide singletons built from environment config. Cached on globalThis
 * so Next.js dev-mode hot reloads do not leak Postgres pools.
 */
const globalCache = globalThis as unknown as { __vaultDb?: Db };

export function getDb(): Db {
  if (!globalCache.__vaultDb) {
    const db = createPgDb({ connectionString: readDatabaseUrl() });
    // On Vercel Fluid compute, close idle pool clients before the function
    // suspends so connections do not leak. A no-op outside Vercel.
    attachDatabasePool(db.pool);
    globalCache.__vaultDb = db;
  }
  return globalCache.__vaultDb;
}

export function getDeps(): Deps {
  const plaidConfig = readPlaidConfig();
  return {
    db: getDb(),
    plaid: createPlaidApi(plaidConfig),
    encryptionKey: parseEncryptionKey(process.env.TOKEN_ENCRYPTION_KEY),
    redirectUri: plaidConfig.redirectUri,
  };
}
