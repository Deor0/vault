import { z } from "zod";

/**
 * Server-side configuration, read from environment variables (`.env` locally).
 * Each subsystem reads only what it needs, so for example the dashboard can
 * render from Postgres even before Plaid keys are configured.
 */

export class ConfigError extends Error {}

export type PlaidEnv = "sandbox" | "production";

export interface PlaidConfig {
  clientId: string;
  secret: string;
  env: PlaidEnv;
  /** Optional OAuth redirect URI; must also be registered in the Plaid Dashboard. */
  redirectUri?: string;
}

const plaidSchema = z.object({
  PLAID_CLIENT_ID: z
    .string({ error: "PLAID_CLIENT_ID is not set" })
    .trim()
    .min(1, "PLAID_CLIENT_ID is not set"),
  PLAID_SECRET: z.string({ error: "PLAID_SECRET is not set" }).trim().min(1, "PLAID_SECRET is not set"),
  PLAID_ENV: z.preprocess(
    (value) => (typeof value === "string" && value.trim() !== "" ? value.trim().toLowerCase() : undefined),
    z
      .enum(["sandbox", "production"], { error: "PLAID_ENV must be 'sandbox' or 'production'" })
      .default("sandbox"),
  ),
  PLAID_REDIRECT_URI: z.preprocess(
    (value) => (typeof value === "string" && value.trim() !== "" ? value.trim() : undefined),
    z.url("PLAID_REDIRECT_URI must be a URL").optional(),
  ),
});

function formatIssues(error: z.ZodError): string {
  return error.issues.map((issue) => issue.message).join("; ");
}

export function readPlaidConfig(env: Record<string, string | undefined> = process.env): PlaidConfig {
  const parsed = plaidSchema.safeParse(env);
  if (!parsed.success) {
    throw new ConfigError(`Plaid is not configured: ${formatIssues(parsed.error)}. See .env.example.`);
  }
  return {
    clientId: parsed.data.PLAID_CLIENT_ID,
    secret: parsed.data.PLAID_SECRET,
    env: parsed.data.PLAID_ENV,
    redirectUri: parsed.data.PLAID_REDIRECT_URI,
  };
}

export function readDatabaseUrl(env: Record<string, string | undefined> = process.env): string {
  const url = env.DATABASE_URL?.trim();
  if (!url) {
    throw new ConfigError("DATABASE_URL is not set. See .env.example.");
  }
  return url;
}

/**
 * The Auth.js session secret. `AUTH_SECRET` (the name Auth.js reads by itself)
 * wins when set; otherwise `BETTER_AUTH_SECRET` is used. Blank values count as
 * unset. Returns undefined when neither is set, so Auth.js reports its own
 * MissingSecret error.
 */
export function readAuthSecret(env: Record<string, string | undefined> = process.env): string | undefined {
  for (const name of ["AUTH_SECRET", "BETTER_AUTH_SECRET"] as const) {
    const value = env[name];
    if (value !== undefined && value.trim() !== "") return value;
  }
  return undefined;
}
