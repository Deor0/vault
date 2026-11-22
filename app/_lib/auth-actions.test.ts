import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb, type TestDb } from "@/tests/support/db";
import { createTestUser } from "@/tests/support/users";

/** The sign-in / sign-up Server Actions, with Auth.js mocked and Postgres in-process. */

const state: { db?: TestDb } = {};
const signIn = vi.fn();
const signOut = vi.fn();

vi.mock("next-auth", () => ({
  AuthError: class AuthError extends Error {
    constructor(readonly type: string) {
      super(type);
    }
  },
}));
vi.mock("@/auth", () => ({ signIn, signOut }));
vi.mock("@/lib/server/context", () => ({ getDb: () => state.db }));

const { AuthError } = (await import("next-auth")) as unknown as { AuthError: new (type: string) => Error };
const { signInAction, signOutAction, signUpAction } = await import("./auth-actions");

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

beforeEach(async () => {
  state.db = await createTestDb();
  signIn.mockReset();
  signOut.mockReset();
});

afterEach(async () => {
  await state.db?.close();
});

describe("signInAction", () => {
  it("signs in with normalized credentials and lands on the dashboard", async () => {
    await signInAction({}, form({ email: " Me@Example.com", password: "pw" }));
    expect(signIn).toHaveBeenCalledWith("credentials", { email: "me@example.com", password: "pw", redirectTo: "/" });
  });

  it("validates fields before calling Auth.js", async () => {
    expect(await signInAction({}, form({ email: "nope", password: "" }))).toEqual({
      fieldErrors: { email: "Enter a valid email address", password: "Enter your password" },
      values: { email: "nope" },
    });
    expect(signIn).not.toHaveBeenCalled();
  });

  it("reports wrong credentials without saying which part was wrong", async () => {
    signIn.mockRejectedValueOnce(new AuthError("CredentialsSignin"));
    expect(await signInAction({}, form({ email: "me@example.com", password: "wrong" }))).toEqual({
      error: "Incorrect email or password.",
      values: { email: "me@example.com" },
    });
  });

  it("lets Next.js redirects through", async () => {
    const redirect = Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;replace;/;307;" });
    signIn.mockRejectedValueOnce(redirect);
    await expect(signInAction({}, form({ email: "me@example.com", password: "pw" }))).rejects.toBe(redirect);
  });
});

describe("signUpAction", () => {
  const valid = { name: "Me", email: "me@example.com", password: "long enough", confirmPassword: "long enough" };

  it("creates the user, then signs them in", async () => {
    await signUpAction({}, form(valid));
    const { rows } = await state.db!.query<{ email: string; name: string }>("SELECT email, name FROM users");
    expect(rows).toEqual([{ email: "me@example.com", name: "Me" }]);
    expect(signIn).toHaveBeenCalledWith("credentials", {
      email: "me@example.com",
      password: "long enough",
      redirectTo: "/",
    });
  });

  it("shows validation errors and keeps the name and email", async () => {
    expect(await signUpAction({}, form({ ...valid, confirmPassword: "different" }))).toEqual({
      fieldErrors: { confirmPassword: "Passwords do not match" },
      values: { name: "Me", email: "me@example.com" },
    });
    expect(signIn).not.toHaveBeenCalled();
  });

  it("refuses an email that already has an account", async () => {
    await createTestUser(state.db!, "me@example.com");
    expect(await signUpAction({}, form(valid))).toMatchObject({
      fieldErrors: { email: "An account with this email already exists. Sign in instead." },
    });
    expect(signIn).not.toHaveBeenCalled();
  });
});

describe("signOutAction", () => {
  it("signs out and returns to the sign-in page", async () => {
    await signOutAction();
    expect(signOut).toHaveBeenCalledWith({ redirectTo: "/signin" });
  });
});
