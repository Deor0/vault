"use server";

import { AuthError } from "next-auth";
import { signIn, signOut } from "@/auth";
import { fieldErrors, registerUser, signInSchema, signUpSchema } from "@/lib/server/auth/users";
import { getDb } from "@/lib/server/context";
import { HOME_PATH, SIGN_IN_PATH } from "@/lib/auth/access";

/** Server Actions behind the sign-in, sign-up, and sign-out forms. */

export interface AuthFormState {
  /** A form-level error, shown above the fields. */
  error?: string;
  fieldErrors?: Partial<Record<"name" | "email" | "password" | "confirmPassword", string>>;
  /** Echoed back so a failed submit keeps what the user typed (never the password). */
  values?: { name?: string; email?: string };
}

function text(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  return typeof value === "string" ? value : undefined;
}

/**
 * Sign in with the Credentials provider. On success Auth.js sets the session
 * cookie and redirects to Overview (by throwing Next.js's redirect, which
 * must propagate), so this only returns on failure.
 */
async function signInWithPassword(email: string, password: string): Promise<AuthFormState> {
  try {
    await signIn("credentials", { email, password, redirectTo: HOME_PATH });
  } catch (error) {
    if (error instanceof AuthError) {
      if (error.type === "CredentialsSignin") {
        return { error: "Incorrect email or password.", values: { email } };
      }
      console.error(`Sign-in failed: ${error.type}`);
      return { error: "Sign-in failed. Please try again.", values: { email } };
    }
    throw error;
  }
  return {};
}

export async function signInAction(_previous: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const email = text(formData, "email") ?? "";
  const parsed = signInSchema.safeParse({ email, password: text(formData, "password") });
  if (!parsed.success) {
    return { fieldErrors: fieldErrors(parsed.error), values: { email } };
  }
  return signInWithPassword(parsed.data.email, parsed.data.password);
}

export async function signUpAction(_previous: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const values = { name: text(formData, "name") ?? "", email: text(formData, "email") ?? "" };
  const parsed = signUpSchema.safeParse({
    ...values,
    password: text(formData, "password"),
    confirmPassword: text(formData, "confirmPassword"),
  });
  if (!parsed.success) {
    return { fieldErrors: fieldErrors(parsed.error), values };
  }

  let result;
  try {
    result = await registerUser(getDb(), parsed.data);
  } catch (error) {
    console.error(`Sign-up failed: ${error instanceof Error ? error.message : "unknown error"}`);
    return { error: "Could not create your account. Check that the database is running and migrated.", values };
  }
  if (result.status === "email_taken") {
    return { fieldErrors: { email: "An account with this email already exists. Sign in instead." }, values };
  }
  return signInWithPassword(parsed.data.email, parsed.data.password);
}

export async function signOutAction(): Promise<void> {
  await signOut({ redirectTo: SIGN_IN_PATH });
}
