import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret, EncryptionKeyError, parseEncryptionKey } from "./crypto";

const key = randomBytes(32);
const secret = "access-sandbox-abc123";

describe("encryptSecret / decryptSecret", () => {
  it("round-trips and never stores the plaintext", () => {
    const ciphertext = encryptSecret(secret, key, "item-1");
    expect(ciphertext).toMatch(/^v1:/);
    expect(ciphertext).not.toContain(secret);
    expect(decryptSecret(ciphertext, key, "item-1")).toBe(secret);
  });

  it("uses a fresh IV for every encryption", () => {
    expect(encryptSecret(secret, key)).not.toBe(encryptSecret(secret, key));
  });

  it("rejects the wrong key", () => {
    const ciphertext = encryptSecret(secret, key);
    expect(() => decryptSecret(ciphertext, randomBytes(32))).toThrow(/wrong key or tampered/);
  });

  it("rejects tampered ciphertext", () => {
    const [version, iv, tag, data] = encryptSecret(secret, key).split(":");
    const bytes = Buffer.from(data, "base64");
    bytes[0] ^= 0xff;
    const tampered = [version, iv, tag, bytes.toString("base64")].join(":");
    expect(() => decryptSecret(tampered, key)).toThrow(/wrong key or tampered/);
  });

  it("binds ciphertext to its associated data", () => {
    const ciphertext = encryptSecret(secret, key, "item-1");
    expect(() => decryptSecret(ciphertext, key, "item-2")).toThrow();
  });

  it("rejects unknown formats", () => {
    expect(() => decryptSecret("plain-token", key)).toThrow(/Unsupported/);
  });
});

describe("parseEncryptionKey", () => {
  it("accepts a base64 32-byte key", () => {
    const encoded = randomBytes(32).toString("base64");
    expect(parseEncryptionKey(encoded)).toHaveLength(32);
  });

  it.each([
    [undefined, /not set/],
    ["", /not set/],
    ["not base64!", /base64/],
    [randomBytes(16).toString("base64"), /32 bytes/],
  ])("rejects %s", (value, message) => {
    expect(() => parseEncryptionKey(value)).toThrow(EncryptionKeyError);
    expect(() => parseEncryptionKey(value)).toThrow(message);
  });
});
