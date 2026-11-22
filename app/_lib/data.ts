import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";
import { SIGN_IN_PATH } from "@/lib/auth/access";
import { getDb } from "@/lib/server/context";
import { getItemsWithAccounts, getRecentTransactions } from "@/lib/server/dashboard";
import { getSessionUserId } from "@/lib/server/session";
import packageJson from "@/package.json";

/**
 * Request-time reads for the signed-in pages. Wrapped in React `cache()` so the
 * sidebar and the page share one query per request.
 */

/** The signed-in user's id. The proxy already redirects signed-out visitors; check again where data is read. */
export const requirePageUserId = cache(async (): Promise<string> => {
  await connection();
  const userId = await getSessionUserId();
  if (!userId) redirect(SIGN_IN_PATH);
  return userId;
});

export const loadItems = cache(async (userId: string) => getItemsWithAccounts(getDb(), userId));

export const loadTransactions = cache(async (userId: string, limit: number) =>
  getRecentTransactions(getDb(), userId, limit),
);

export const VAULT_VERSION = packageJson.version;

/** The host this instance is being served on, as the browser asked for it. */
export async function instanceHost(): Promise<string> {
  const requestHeaders = await headers();
  return requestHeaders.get("host") ?? "localhost";
}

/** Whether Postgres answers right now. */
export const databaseReachable = cache(async (): Promise<boolean> => {
  try {
    await getDb().query("SELECT 1");
    return true;
  } catch {
    return false;
  }
});
