import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { getEncryptionKey } from "@/lib/env";

/**
 * Symmetric encryption for secrets stored at rest. Today the only
 * caller is the seller's NWC connection URI (`users.nwc_uri`, ADR
 * 0029), a wallet credential that must never be persisted in
 * plaintext.
 *
 * AES-256-GCM (authenticated encryption): the auth tag means a
 * tampered ciphertext fails to decrypt rather than yielding garbage.
 * The key comes from `getEncryptionKey()` (`ENCRYPTION_KEY`). Ported
 * from the sister project `bitbybit-habits` so both codebases share
 * one wire format.
 *
 * Server-only: pulls in `node:crypto` and reads the key, so it must
 * never reach the client bundle.
 */

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

/**
 * Encrypts a UTF-8 string. Returns `base64(iv + ciphertext + authTag)`
 * — a single self-describing token, since the IV (fixed 16 bytes,
 * leading) and auth tag (fixed 16 bytes, trailing) bracket the
 * ciphertext.
 */
export function encrypt(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return Buffer.concat([iv, encrypted, authTag]).toString("base64");
}

/**
 * Reverses {@link encrypt}. Throws if the token is malformed, was
 * encrypted under a different key, or has been tampered with (the GCM
 * auth tag check fails).
 */
export function decrypt(packed: string): string {
  const key = getEncryptionKey();
  const buf = Buffer.from(packed, "base64");

  const iv = buf.subarray(0, IV_LENGTH);
  const authTag = buf.subarray(buf.length - AUTH_TAG_LENGTH);
  const ciphertext = buf.subarray(IV_LENGTH, buf.length - AUTH_TAG_LENGTH);

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  return Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]).toString("utf8");
}
