import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Deps } from "@/lib/server/deps";
import { ConfigError } from "@/lib/server/env";
import { createTestDb, type TestDb } from "@/tests/support/db";
import { ACCESS_TOKEN, createFakePlaid, plaidApiError, type FakePlaid } from "@/tests/support/plaid";

/** Route handlers end to end, with the database in-process and Plaid faked. */

const state: { deps?: Deps; configError?: Error } = {};

vi.mock("@/lib/server/context", () => ({
  getDeps: () => {
    if (state.configError) throw state.configError;
    return state.deps;
  },
  getDb: () => state.deps?.db,
}));

const { POST: linkTokenPOST } = await import("./plaid/link-token/route");
const { POST: exchangePOST } = await import("./plaid/exchange/route");
const { POST: updateCompletePOST } = await import("./plaid/update-complete/route");
const { POST: syncPOST } = await import("./sync/route");

let db: TestDb;
let plaid: FakePlaid;

beforeEach(async () => {
  db = await createTestDb();
  plaid = createFakePlaid();
  state.deps = { db, plaid, encryptionKey: randomBytes(32) };
  state.configError = undefined;
});

afterEach(async () => {
  await db.close();
});

function jsonRequest(path: string, body: unknown, headers: Record<string, string> = {}) {
  return new Request(`http://localhost:3000${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", host: "localhost:3000", ...headers },
    body: JSON.stringify(body),
  });
}

describe("POST /api/plaid/link-token", () => {
  it("returns a link token", async () => {
    const response = await linkTokenPOST(jsonRequest("/api/plaid/link-token", {}));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ linkToken: "link-sandbox-token", mode: "create" });
  });

  it("rejects cross-origin requests", async () => {
    const response = await linkTokenPOST(
      jsonRequest("/api/plaid/link-token", {}, { origin: "https://evil.example" }),
    );
    expect(response.status).toBe(403);
    expect(plaid.createLinkToken).not.toHaveBeenCalled();
  });

  it("rejects non-JSON requests", async () => {
    const request = new Request("http://localhost:3000/api/plaid/link-token", {
      method: "POST",
      headers: { "content-type": "text/plain", host: "localhost:3000" },
      body: "{}",
    });
    expect((await linkTokenPOST(request)).status).toBe(415);
  });

  it("validates itemId", async () => {
    const response = await linkTokenPOST(jsonRequest("/api/plaid/link-token", { itemId: "nope" }));
    expect(response.status).toBe(400);
  });

  it("reports missing configuration by name", async () => {
    state.configError = new ConfigError("Plaid is not configured: PLAID_SECRET is not set.");
    const response = await linkTokenPOST(jsonRequest("/api/plaid/link-token", {}));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: { code: "not_configured", message: "Plaid is not configured: PLAID_SECRET is not set." },
    });
  });
});

describe("POST /api/plaid/exchange", () => {
  it("links the Item and never returns the access token", async () => {
    const response = await exchangePOST(
      jsonRequest("/api/plaid/exchange", {
        publicToken: "public-sandbox-token",
        institution: { id: "ins_109508", name: "First Platypus Bank" },
      }),
    );
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).not.toContain(ACCESS_TOKEN);
    expect(JSON.parse(text)).toMatchObject({ status: "linked" });
  });

  it("requires a public token", async () => {
    const response = await exchangePOST(jsonRequest("/api/plaid/exchange", {}));
    expect(response.status).toBe(400);
    expect(plaid.exchangePublicToken).not.toHaveBeenCalled();
  });

  it("maps Plaid errors to 502 with Plaid's error code only", async () => {
    const error = plaidApiError("INVALID_PUBLIC_TOKEN", "INVALID_INPUT");
    plaid.exchangePublicToken.mockRejectedValueOnce(error);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = await exchangePOST(jsonRequest("/api/plaid/exchange", { publicToken: "bad" }));
    consoleError.mockRestore();
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      error: { code: "INVALID_PUBLIC_TOKEN", message: "Plaid request failed (INVALID_PUBLIC_TOKEN)" },
    });
  });
});

describe("POST /api/plaid/update-complete and /api/sync", () => {
  it("re-syncs after update mode and on manual refresh", async () => {
    const exchange = await (await exchangePOST(jsonRequest("/api/plaid/exchange", { publicToken: "p" }))).json();

    const updated = await updateCompletePOST(jsonRequest("/api/plaid/update-complete", { itemId: exchange.itemId }));
    expect(updated.status).toBe(200);
    expect(await updated.json()).toMatchObject({ status: "synced" });

    const refreshed = await syncPOST(jsonRequest("/api/sync", {}));
    expect(refreshed.status).toBe(200);
    expect(await refreshed.json()).toMatchObject({ results: [{ itemId: exchange.itemId, status: "synced" }] });
  });

  it("404s for an unknown Item", async () => {
    const response = await syncPOST(jsonRequest("/api/sync", { itemId: "00000000-0000-0000-0000-000000000000" }));
    expect(response.status).toBe(404);
  });
});
