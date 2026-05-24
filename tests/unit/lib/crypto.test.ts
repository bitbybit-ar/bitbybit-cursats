// @vitest-environment node
import { describe, it, expect } from "vitest";
import { encrypt, decrypt } from "@/lib/crypto";

// Exercises the AES-256-GCM helper used to store the seller's NWC URI
// at rest (ADR 0029). Runs against the deterministic dev/test key
// fallback in lib/env (NODE_ENV !== production).
describe("crypto encrypt/decrypt (AES-256-GCM)", () => {
  it("round-trips a connection-string-shaped value", () => {
    const plain =
      "nostr+walletconnect://abc123?relay=wss://relay.example.com&secret=deadbeef";
    expect(decrypt(encrypt(plain))).toBe(plain);
  });

  it("round-trips empty and unicode values", () => {
    expect(decrypt(encrypt(""))).toBe("");
    expect(decrypt(encrypt("héllo 🌶 ñandú"))).toBe("héllo 🌶 ñandú");
  });

  it("produces a fresh ciphertext each call (random IV)", () => {
    const p = "same-plaintext";
    expect(encrypt(p)).not.toBe(encrypt(p));
  });

  it("rejects a tampered ciphertext via the GCM auth tag", () => {
    const packed = encrypt("a wallet secret");
    const buf = Buffer.from(packed, "base64");
    buf[buf.length - 1] ^= 0xff; // flip a bit in the trailing auth tag
    expect(() => decrypt(buf.toString("base64"))).toThrow();
  });

  it("rejects malformed input", () => {
    expect(() => decrypt("clearly-not-a-valid-token")).toThrow();
  });
});
