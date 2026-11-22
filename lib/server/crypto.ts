import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * AES-256-GCM encryption for secrets stored at rest (Plaid access tokens).
 *
 * Ciphertext format: `v1:<iv base64>:<auth tag base64>:<ciphertext base64>`.
 * The version prefix leaves room for key rotation or algorithm changes later.
 * An optional "associated data" string (for example the Plaid item_id) binds a
 * ciphertext to its row, so a ciphertext copied onto another row fails to decrypt.
 */

const VERSION = "v1";
const ALGORITHM = "aes-256-gcm";
const KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;

export class EncryptionKeyError extends Error {}

/** Parse a base64-encoded 32-byte key, as produced by `openssl rand -base64 32`. */
export function parseEncryptionKey(encoded: string | undefined): Buffer {
  if (!encoded || encoded.trim() === "") {
    throw new EncryptionKeyError(
      "TOKEN_ENCRYPTION_KEY is not set. Generate one with `openssl rand -base64 32`.",
    );
  }
  const trimmed = encoded.trim();
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(trimmed)) {
    throw new EncryptionKeyError("TOKEN_ENCRYPTION_KEY must be base64-encoded.");
  }
  const key = Buffer.from(trimmed, "base64");
  if (key.length !== KEY_BYTES) {
    throw new EncryptionKeyError(
      `TOKEN_ENCRYPTION_KEY must decode to ${KEY_BYTES} bytes (got ${key.length}).`,
    );
  }
  return key;
}

export function encryptSecret(plaintext: string, key: Buffer, associatedData?: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_BYTES });
  if (associatedData !== undefined) cipher.setAAD(Buffer.from(associatedData, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64"), tag.toString("base64"), ciphertext.toString("base64")].join(
    ":",
  );
}

export function decryptSecret(payload: string, key: Buffer, associatedData?: string): string {
  const parts = payload.split(":");
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error("Unsupported encrypted secret format.");
  }
  const [, ivB64, tagB64, dataB64] = parts;
  const iv = Buffer.from(ivB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) {
    throw new Error("Malformed encrypted secret.");
  }
  const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: TAG_BYTES });
  if (associatedData !== undefined) decipher.setAAD(Buffer.from(associatedData, "utf8"));
  decipher.setAuthTag(tag);
  try {
    return Buffer.concat([
      decipher.update(Buffer.from(dataB64, "base64")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    // Never echo the payload or key material in errors.
    throw new Error("Failed to decrypt secret: wrong key or tampered data.");
  }
}
