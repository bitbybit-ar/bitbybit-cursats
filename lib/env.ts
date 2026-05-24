// Centralised environment access. Each helper throws at boot when the
// underlying value is missing in production, and returns a deterministic
// dev/test fallback when one is safe. Callers must use these helpers
// rather than reading `process.env` directly so the failure mode is
// predictable.

export function getBaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_BASE_URL;
  if (!url) {
    throw new Error(
      "NEXT_PUBLIC_BASE_URL is not set. Configure it in .env.local (or your hosting environment) before running the app."
    );
  }
  return url;
}

export function getDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Configure it in .env.local with a Neon (or other Postgres) connection string."
    );
  }
  return url;
}

// JWT signing key for the buyer + admin Nostr session cookie.
// Required in production; deterministic fallback in dev/test so the
// suite can run without env wiring.
export function getAuthSecret(): Uint8Array {
  const raw = process.env.AUTH_SECRET;
  if (raw && raw.length > 0) {
    return new TextEncoder().encode(raw);
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "AUTH_SECRET is required in production. Generate one with `openssl rand -base64 32`."
    );
  }
  return new TextEncoder().encode("dev-secret-change-in-production");
}

// AES-256-GCM key for encrypting wallet credentials at rest — today
// just `users.nwc_uri`, the seller's NWC connection (ADR 0029). The
// value is a base64-encoded 32-byte key. Required in production;
// deterministic dev/test fallback so the suite and `npm run dev` run
// without env wiring (the fallback is not secret and must never be
// used to protect real credentials).
export function getEncryptionKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY;
  if (raw && raw.length > 0) {
    const buf = Buffer.from(raw, "base64");
    if (buf.length !== 32) {
      throw new Error(
        "ENCRYPTION_KEY must decode to 32 bytes. Generate one with `openssl rand -base64 32`."
      );
    }
    return buf;
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "ENCRYPTION_KEY is required in production to encrypt wallet credentials at rest. Generate one with `openssl rand -base64 32`."
    );
  }
  return Buffer.alloc(32, "cursats-dev-encryption-key");
}
