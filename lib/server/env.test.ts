import { describe, expect, it } from "vitest";
import { plaidBaseUrl } from "./plaid/client";
import { ConfigError, readAuthSecret, readDatabaseUrl, readMigrationDatabaseUrl, readPlaidConfig } from "./env";

describe("readPlaidConfig", () => {
  it("defaults PLAID_ENV to sandbox", () => {
    const config = readPlaidConfig({ PLAID_CLIENT_ID: "id", PLAID_SECRET: "secret" });
    expect(config.env).toBe("sandbox");
    expect(plaidBaseUrl(config.env)).toBe("https://sandbox.plaid.com");
  });

  it("switches to production by configuration alone", () => {
    const config = readPlaidConfig({ PLAID_CLIENT_ID: "id", PLAID_SECRET: "secret", PLAID_ENV: "Production" });
    expect(config.env).toBe("production");
    expect(plaidBaseUrl(config.env)).toBe("https://production.plaid.com");
  });

  it("rejects unknown environments", () => {
    expect(() =>
      readPlaidConfig({ PLAID_CLIENT_ID: "id", PLAID_SECRET: "secret", PLAID_ENV: "development" }),
    ).toThrow(/PLAID_ENV must be 'sandbox' or 'production'/);
  });

  it("names missing keys without echoing secret values", () => {
    try {
      readPlaidConfig({ PLAID_CLIENT_ID: "client-id-value", PLAID_ENV: "sandbox" });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigError);
      expect((error as Error).message).toMatch(/PLAID_SECRET is not set/);
      expect((error as Error).message).not.toContain("client-id-value");
    }
  });

  it("treats a blank redirect URI as unset", () => {
    const config = readPlaidConfig({ PLAID_CLIENT_ID: "id", PLAID_SECRET: "s", PLAID_REDIRECT_URI: " " });
    expect(config.redirectUri).toBeUndefined();
  });
});

describe("readDatabaseUrl", () => {
  it("requires DATABASE_URL", () => {
    expect(() => readDatabaseUrl({})).toThrow(ConfigError);
    expect(readDatabaseUrl({ DATABASE_URL: "postgres://vault:vault@localhost:5432/vault" })).toBe(
      "postgres://vault:vault@localhost:5432/vault",
    );
  });
});

describe("readMigrationDatabaseUrl", () => {
  it("prefers the direct DATABASE_URL_UNPOOLED", () => {
    expect(
      readMigrationDatabaseUrl({
        DATABASE_URL: "postgres://u:p@ep-x-pooler.neon.tech/db",
        DATABASE_URL_UNPOOLED: "postgres://u:p@ep-x.neon.tech/db",
      }),
    ).toBe("postgres://u:p@ep-x.neon.tech/db");
  });

  it("falls back to DATABASE_URL when DATABASE_URL_UNPOOLED is unset or blank", () => {
    const local = "postgres://vault:vault@localhost:5432/vault";
    expect(readMigrationDatabaseUrl({ DATABASE_URL: local })).toBe(local);
    expect(readMigrationDatabaseUrl({ DATABASE_URL: local, DATABASE_URL_UNPOOLED: " " })).toBe(local);
    expect(() => readMigrationDatabaseUrl({})).toThrow(ConfigError);
  });
});

describe("readAuthSecret", () => {
  it("uses BETTER_AUTH_SECRET when AUTH_SECRET is unset or blank", () => {
    expect(readAuthSecret({ BETTER_AUTH_SECRET: "better" })).toBe("better");
    expect(readAuthSecret({ AUTH_SECRET: " ", BETTER_AUTH_SECRET: "better" })).toBe("better");
  });

  it("prefers AUTH_SECRET when both are set", () => {
    expect(readAuthSecret({ AUTH_SECRET: "auth", BETTER_AUTH_SECRET: "better" })).toBe("auth");
  });

  it("returns undefined when neither is set", () => {
    expect(readAuthSecret({})).toBeUndefined();
    expect(readAuthSecret({ AUTH_SECRET: "", BETTER_AUTH_SECRET: "" })).toBeUndefined();
  });
});
