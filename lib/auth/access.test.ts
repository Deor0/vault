import type { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { authConfig } from "@/auth.config";
import { decideAccess } from "./access";

describe("decideAccess", () => {
  it.each([
    // path, signed in, expected
    ["/", false, "redirect-signin"],
    ["/", true, "allow"],
    ["/api/plaid/link-token", false, "unauthorized"],
    ["/api/plaid/exchange", false, "unauthorized"],
    ["/api/plaid/update-complete", false, "unauthorized"],
    ["/api/sync", false, "unauthorized"],
    ["/api/sync", true, "allow"],
    ["/api/auth/session", false, "allow"],
    ["/api/auth/callback/credentials", false, "allow"],
    ["/api/authority", false, "unauthorized"],
    ["/signin", false, "allow"],
    ["/signup", false, "allow"],
    ["/signin", true, "redirect-home"],
    ["/signup", true, "redirect-home"],
    ["/signinx", false, "redirect-signin"],
  ] as const)("%s (signed in: %s) => %s", (path, signedIn, expected) => {
    expect(decideAccess(path, signedIn)).toBe(expected);
  });
});

describe("authConfig.callbacks.authorized (proxy)", () => {
  async function run(path: string, userId?: string) {
    const request = { nextUrl: new URL(`http://127.0.0.1:3000${path}`) } as unknown as NextRequest;
    const auth = userId ? { user: { id: userId }, expires: "2099-01-01T00:00:00Z" } : null;
    return authConfig.callbacks.authorized({ request, auth });
  }

  it("lets signed-in requests through", async () => {
    expect(await run("/", "user-1")).toBe(true);
    expect(await run("/api/sync", "user-1")).toBe(true);
  });

  it("redirects signed-out page visits to sign-in", async () => {
    const response = (await run("/")) as Response;
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("http://127.0.0.1:3000/signin");
  });

  it("answers signed-out API calls with 401 JSON", async () => {
    const response = (await run("/api/plaid/link-token")) as Response;
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: { code: "unauthorized", message: "Sign in to continue" } });
  });

  it("sends signed-in users away from the sign-in page", async () => {
    const response = (await run("/signin", "user-1")) as Response;
    expect(response.headers.get("location")).toBe("http://127.0.0.1:3000/");
  });

  it("puts the user id on the session", () => {
    const session = authConfig.callbacks.session({
      session: { user: {}, expires: "2099-01-01T00:00:00Z" },
      token: { sub: "user-1" },
    } as never);
    expect(session).toMatchObject({ user: { id: "user-1" } });
  });
});
