import bcrypt from "bcryptjs";
import { z } from "zod";
import type { Db, Queryable } from "../db/types";

/** Users, password hashing, and the email + password rules behind sign-up and sign-in. */

export type User = {
  id: string;
  email: string;
  name: string | null;
};

/** bcrypt work factor. 12 rounds is roughly 0.25s per hash on a laptop. */
export const BCRYPT_ROUNDS = 12;
export const PASSWORD_MIN_LENGTH = 8;
/** bcrypt ignores everything past 72 bytes, so longer passwords are rejected rather than silently truncated. */
export const PASSWORD_MAX_BYTES = 72;

const emailSchema = z
  .string({ error: "Enter your email address" })
  .trim()
  .toLowerCase()
  .min(1, "Enter your email address")
  .max(254, "That email address is too long")
  .pipe(z.email("Enter a valid email address"));

export const signInSchema = z.object({
  email: emailSchema,
  password: z.string({ error: "Enter your password" }).min(1, "Enter your password"),
});

export const signUpSchema = z
  .object({
    name: z.preprocess(
      (value) => (typeof value === "string" && value.trim() !== "" ? value.trim() : undefined),
      z.string().max(100, "Keep your name under 100 characters").optional(),
    ),
    email: emailSchema,
    password: z
      .string({ error: "Choose a password" })
      .min(PASSWORD_MIN_LENGTH, `Use at least ${PASSWORD_MIN_LENGTH} characters`)
      .refine((value) => Buffer.byteLength(value, "utf8") <= PASSWORD_MAX_BYTES, "That password is too long"),
    confirmPassword: z.string({ error: "Confirm your password" }),
  })
  .refine((value) => value.password === value.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match",
  });

export type SignUpInput = z.infer<typeof signUpSchema>;

export type FieldErrors<K extends string> = Partial<Record<K, string>>;

/** First error message per field, for showing next to form inputs. */
export function fieldErrors<K extends string>(error: z.ZodError): FieldErrors<K> {
  const errors: FieldErrors<K> = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (typeof key === "string" && !(key in errors)) errors[key as K] = issue.message;
  }
  return errors;
}

// A real hash to compare against when the email is unknown, so a wrong email
// takes as long as a wrong password and response timing does not reveal
// which emails have accounts.
let dummyHash: Promise<string> | undefined;
function getDummyHash(): Promise<string> {
  dummyHash ??= bcrypt.hash("vault-dummy-password", BCRYPT_ROUNDS);
  return dummyHash;
}

/**
 * The Credentials `authorize` check: returns the user when the email and
 * password match, otherwise null. Never says which of the two was wrong.
 */
export async function verifyCredentials(db: Queryable, credentials: unknown): Promise<User | null> {
  const parsed = signInSchema.safeParse(credentials);
  if (!parsed.success) return null;
  const { email, password } = parsed.data;
  if (Buffer.byteLength(password, "utf8") > PASSWORD_MAX_BYTES) return null;

  const { rows } = await db.query<User & { password_hash: string }>(
    "SELECT id, email, name, password_hash FROM users WHERE email = $1",
    [email],
  );
  const user = rows[0];
  const matches = await bcrypt.compare(password, user?.password_hash ?? (await getDummyHash()));
  if (!user || !matches) return null;
  return { id: user.id, email: user.email, name: user.name };
}

export type RegisterResult = { status: "created"; user: User } | { status: "email_taken" };

/**
 * Create a user with a bcrypt-hashed password. The first user ever created
 * also takes ownership of any Plaid data linked before Vault had accounts.
 */
export async function registerUser(
  db: Db,
  input: Pick<SignUpInput, "email" | "password" | "name">,
): Promise<RegisterResult> {
  const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
  return db.transaction(async (tx) => {
    const { rows } = await tx.query<User>(
      `INSERT INTO users (email, name, password_hash) VALUES ($1, $2, $3)
       ON CONFLICT (email) DO NOTHING
       RETURNING id, email, name`,
      [input.email, input.name ?? null, passwordHash],
    );
    const user = rows[0];
    if (!user) return { status: "email_taken" };

    const others = await tx.query<{ exists: boolean }>(
      "SELECT EXISTS (SELECT 1 FROM users WHERE id <> $1) AS exists",
      [user.id],
    );
    if (!others.rows[0].exists) await claimUnownedData(tx, user.id);
    return { status: "created", user };
  });
}

/**
 * Attach Items, accounts, and transactions that have no owner (linked before
 * the users table existed) to `userId`. Concurrent callers cannot split the
 * data: the row locks taken by the first UPDATE make any other caller skip
 * rows that are already owned.
 */
export async function claimUnownedData(db: Queryable, userId: string): Promise<{ items: number }> {
  const items = await db.query<{ id: string }>(
    "UPDATE plaid_items SET user_id = $1, updated_at = now() WHERE user_id IS NULL RETURNING id",
    [userId],
  );
  await db.query(
    `UPDATE accounts a SET user_id = i.user_id
     FROM plaid_items i WHERE a.item_id = i.id AND a.user_id IS NULL AND i.user_id = $1`,
    [userId],
  );
  await db.query(
    `UPDATE transactions t SET user_id = i.user_id
     FROM plaid_items i WHERE t.item_id = i.id AND t.user_id IS NULL AND i.user_id = $1`,
    [userId],
  );
  return { items: items.rows.length };
}
