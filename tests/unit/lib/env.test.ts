import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { getBaseUrl, getDatabaseUrl, getAuthSecret } from "@/lib/env";

const originalEnv = { ...process.env };

afterEach(() => {
  vi.unstubAllEnvs();
  process.env = { ...originalEnv };
});

describe("env/getBaseUrl", () => {
  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_BASE_URL;
  });

  it("throws when NEXT_PUBLIC_BASE_URL is unset", () => {
    expect(() => getBaseUrl()).toThrow(/NEXT_PUBLIC_BASE_URL/);
  });

  it("returns the configured value", () => {
    process.env.NEXT_PUBLIC_BASE_URL = "https://example.test";
    expect(getBaseUrl()).toBe("https://example.test");
  });
});

describe("env/getDatabaseUrl", () => {
  beforeEach(() => {
    delete process.env.DATABASE_URL;
  });

  it("throws when DATABASE_URL is unset", () => {
    expect(() => getDatabaseUrl()).toThrow(/DATABASE_URL/);
  });
});

describe("env/getAuthSecret", () => {
  beforeEach(() => {
    delete process.env.AUTH_SECRET;
  });

  it("returns a deterministic dev fallback when unset and not in production", () => {
    vi.stubEnv("NODE_ENV", "test");
    const secret = getAuthSecret();
    // Cross-realm `instanceof Uint8Array` fails under jsdom, so check
    // the structural traits instead: it must be array-like with bytes.
    expect(ArrayBuffer.isView(secret)).toBe(true);
    expect(secret.length).toBeGreaterThan(0);
  });

  it("throws in production when unset", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(() => getAuthSecret()).toThrow(/AUTH_SECRET/);
  });

  it("returns the configured secret when set", () => {
    process.env.AUTH_SECRET = "real-secret-value";
    const secret = getAuthSecret();
    expect(new TextDecoder().decode(secret)).toBe("real-secret-value");
  });
});
