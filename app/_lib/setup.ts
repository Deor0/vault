import { ConfigError } from "@/lib/server/env";

/** Instance setup facts shown in the sidebar footer, the first-run checklist, and the setup notice. */

export interface PlaidSetup {
  env: string;
  configured: boolean;
}

/** Which Plaid environment this instance talks to, and whether its keys are set (never the keys themselves). */
export function plaidSetup(env: Record<string, string | undefined> = process.env): PlaidSetup {
  return {
    env: env.PLAID_ENV?.trim().toLowerCase() || "sandbox",
    configured: Boolean(env.PLAID_CLIENT_ID?.trim() && env.PLAID_SECRET?.trim()),
  };
}

/** A one-line fix for a failed data read, shown in place of the page. */
export function setupMessage(error: unknown): string {
  if (error instanceof ConfigError) return error.message;
  const code = (error as { code?: unknown } | null)?.code;
  if (code === "42P01") return "The database schema is missing. Run `npm run db:migrate`.";
  if (code === "42703") return "The database schema is out of date. Run `npm run db:migrate`.";
  const message = error instanceof Error ? error.message : "";
  if (code === "ECONNREFUSED" || code === "ENOTFOUND" || /timeout.*connect|connection timeout/i.test(message)) {
    return "Cannot reach Postgres. Start it with `docker compose up -d db` and check DATABASE_URL.";
  }
  if (code === "28P01" || code === "3D000") {
    return "Postgres rejected the connection. Check the credentials and database name in DATABASE_URL.";
  }
  console.error(`Vault failed to load data: ${message || "unknown error"}`);
  return "Vault could not load your data. Check the server logs.";
}
