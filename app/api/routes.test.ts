import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Deps } from "@/lib/server/deps";
import { ConfigError } from "@/lib/server/env";
import { createTestDb, type TestDb } from "@/tests/support/db";
import { ACCESS_TOKEN, createFakePlaid, plaidApiError, type FakePlaid } from "@/tests/support/plaid";
import { createTestUser } from "@/tests/support/users";

/** Route handlers end to end, with the database in-process, Plaid faked, and the Auth.js session mocked. */

const state: { deps?: Deps; configError?: Error; userId?: string | null } = {};

vi.mock("@/auth", () => ({
  auth: async () => (state.userId ? { user: { id: state.userId }, expires: "2099-01-01T00:00:00Z" } : null),
}));

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
const { POST: overridePOST } = await import("./subscriptions/override/route");

let db: TestDb;
let plaid: FakePlaid;
let userId: string;

beforeEach(async () => {
  db = await createTestDb();
  plaid = createFakePlaid();
  userId = await createTestUser(db);
  state.deps = { db, plaid, encryptionKey: randomBytes(32) };
  state.configError = undefined;
  state.userId = userId;
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

describe("POST /api/subscriptions/override", () => {
  async function overrides() {
    const { rows } = await db.query(
      "SELECT user_id, stream_key, status, kind, display_name, cancelled_at::text AS cancelled_at FROM subscription_overrides",
    );
    return rows;
  }

  it("records a decision for the signed-in user without touching Plaid", async () => {
    const response = await overridePOST(
      jsonRequest("/api/subscriptions/override", { streamKey: "n:netflix", status: "cancelled", cancelledAt: "2026-11-20" }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      override: { streamKey: "n:netflix", status: "cancelled", kind: null, displayName: null, cancelledAt: "2026-11-20" },
    });

    const renamed = await overridePOST(
      jsonRequest("/api/subscriptions/override", { streamKey: "n:netflix", displayName: "Netflix Premium", kind: "bill" }),
    );
    expect((await renamed.json()).override).toMatchObject({ status: "cancelled", cancelledAt: "2026-11-20", kind: "bill" });
    expect(await overrides()).toEqual([
      {
        user_id: userId,
        stream_key: "n:netflix",
        status: "cancelled",
        kind: "bill",
        display_name: "Netflix Premium",
        cancelled_at: "2026-11-20",
      },
    ]);
    for (const method of Object.values(plaid)) expect(method).not.toHaveBeenCalled();
  });

  it("dates a cancellation today when no date is given, and clears it on undo", async () => {
    const today = new Date().toISOString().slice(0, 10);
    await overridePOST(jsonRequest("/api/subscriptions/override", { streamKey: "e:ent-1", status: "cancelled" }));
    expect((await overrides())[0]).toMatchObject({ status: "cancelled", cancelled_at: today });
    await overridePOST(jsonRequest("/api/subscriptions/override", { streamKey: "e:ent-1", status: "confirmed" }));
    expect((await overrides())[0]).toMatchObject({ status: "confirmed", cancelled_at: null });
  });

  it.each([
    [{}, "streamKey is required"],
    [{ streamKey: "  " }, "streamKey is required"],
    [{ streamKey: "k", status: "paused" }, ""],
    [{ streamKey: "k", kind: "gift" }, ""],
    [{ streamKey: "k", displayName: "x".repeat(81) }, "Name is too long"],
    [{ streamKey: "k", status: "cancelled", cancelledAt: "next week" }, "cancelledAt must be a date"],
    [{ streamKey: "k", status: "ignored", cancelledAt: "2026-11-20" }, "cancelledAt is only allowed"],
  ])("rejects %j", async (body, message) => {
    const response = await overridePOST(jsonRequest("/api/subscriptions/override", body));
    expect(response.status).toBe(400);
    expect((await response.json()).error.message).toContain(message);
    expect(await overrides()).toEqual([]);
  });

  it("rejects cross-origin requests", async () => {
    const response = await overridePOST(
      jsonRequest("/api/subscriptions/override", { streamKey: "k", status: "ignored" }, { origin: "https://evil.example" }),
    );
    expect(response.status).toBe(403);
    expect(await overrides()).toEqual([]);
  });

  it("works without Plaid keys configured", async () => {
    state.configError = new ConfigError("Plaid is not configured: PLAID_SECRET is not set.");
    const response = await overridePOST(jsonRequest("/api/subscriptions/override", { streamKey: "k", status: "ignored" }));
    expect(response.status).toBe(200);
  });
});

describe("session gating", () => {
  const routes = [
    ["/api/plaid/link-token", () => linkTokenPOST, {}],
    ["/api/plaid/exchange", () => exchangePOST, { publicToken: "public-sandbox-token" }],
    ["/api/plaid/update-complete", () => updateCompletePOST, { itemId: "00000000-0000-0000-0000-000000000000" }],
    ["/api/sync", () => syncPOST, {}],
    ["/api/subscriptions/override", () => overridePOST, { streamKey: "n:netflix", status: "ignored" }],
  ] as const;

  it.each(routes)("%s answers 401 without a session and never calls Plaid", async (path, handler, body) => {
    state.userId = null;
    const response = await handler()(jsonRequest(path, body));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: { code: "unauthorized", message: "Sign in to continue" } });
    for (const method of Object.values(plaid)) expect(method).not.toHaveBeenCalled();
    expect((await db.query("SELECT 1 FROM subscription_overrides")).rows).toEqual([]);
  });

  it("keeps each user's Items to themselves", async () => {
    const exchange = await (await exchangePOST(jsonRequest("/api/plaid/exchange", { publicToken: "p" }))).json();
    expect(exchange).toMatchObject({ status: "linked" });

    state.userId = await createTestUser(db, "someone-else@example.com");
    plaid.getAccounts.mockClear();

    const sync = await syncPOST(jsonRequest("/api/sync", { itemId: exchange.itemId }));
    expect(sync.status).toBe(404);
    const reconnect = await linkTokenPOST(jsonRequest("/api/plaid/link-token", { itemId: exchange.itemId }));
    expect(reconnect.status).toBe(404);
    const update = await updateCompletePOST(jsonRequest("/api/plaid/update-complete", { itemId: exchange.itemId }));
    expect(update.status).toBe(404);
    expect(await (await syncPOST(jsonRequest("/api/sync", {}))).json()).toEqual({ results: [] });
    expect(plaid.getAccounts).not.toHaveBeenCalled();
  });

  it("creates Link tokens for the signed-in user", async () => {
    await linkTokenPOST(jsonRequest("/api/plaid/link-token", {}));
    expect(plaid.createLinkToken.mock.calls[0][0].user?.client_user_id).toBe(userId);
  });
});
