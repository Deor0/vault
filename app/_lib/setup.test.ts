import { afterEach, describe, expect, it, vi } from "vitest";
import { ConfigError } from "@/lib/server/env";
import { plaidSetup, setupMessage } from "./setup";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("plaidSetup", () => {
  it("defaults to sandbox and reports whether both keys are set", () => {
    expect(plaidSetup({})).toEqual({ env: "sandbox", configured: false });
    expect(plaidSetup({ PLAID_CLIENT_ID: "id", PLAID_SECRET: " " })).toEqual({ env: "sandbox", configured: false });
    expect(plaidSetup({ PLAID_CLIENT_ID: "id", PLAID_SECRET: "secret", PLAID_ENV: " Production " })).toEqual({
      env: "production",
      configured: true,
    });
  });
});

describe("setupMessage", () => {
  it("names the fix for configuration and database errors", () => {
    expect(setupMessage(new ConfigError("DATABASE_URL is not set. See .env.example."))).toBe(
      "DATABASE_URL is not set. See .env.example.",
    );
    expect(setupMessage(Object.assign(new Error("relation does not exist"), { code: "42P01" }))).toMatch(
      /npm run db:migrate/,
    );
    expect(setupMessage(Object.assign(new Error("column does not exist"), { code: "42703" }))).toBe(
      "The database schema is out of date. Run `npm run db:migrate`.",
    );
    expect(setupMessage(Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" }))).toMatch(
      /docker compose up -d db/,
    );
    expect(setupMessage(new Error("timeout exceeded when trying to connect"))).toMatch(/Cannot reach Postgres/);
    expect(setupMessage(Object.assign(new Error("password authentication failed"), { code: "28P01" }))).toMatch(
      /rejected the connection/,
    );
  });

  it("logs anything else and points at the server logs", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(setupMessage(new Error("boom"))).toBe("Vault could not load your data. Check the server logs.");
    expect(log).toHaveBeenCalledWith("Vault failed to load data: boom");
  });
});
