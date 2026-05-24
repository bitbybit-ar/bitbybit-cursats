// @vitest-environment node
import { describe, it, expect } from "vitest";
import { buildContentSecurityPolicy, generateNonce } from "@/lib/csp";

describe("csp/generateNonce", () => {
  it("returns base64 decoding to 16 bytes", () => {
    const nonce = generateNonce();
    expect(nonce).toMatch(/^[A-Za-z0-9+/]+={0,2}$/);
    expect(Buffer.from(nonce, "base64")).toHaveLength(16);
  });

  it("returns a fresh value each call", () => {
    const seen = new Set(Array.from({ length: 100 }, () => generateNonce()));
    expect(seen.size).toBe(100);
  });
});

describe("csp/buildContentSecurityPolicy", () => {
  it("production drops unsafe-inline and binds scripts to the nonce", () => {
    const csp = buildContentSecurityPolicy({ nonce: "abc123", isDev: false });
    expect(csp).toContain(
      "script-src 'self' 'nonce-abc123' 'strict-dynamic'"
    );
    // The whole point of the fix: no inline-script escape hatch and no
    // eval in production.
    expect(csp).not.toContain("'unsafe-inline' 'unsafe-eval'");
    expect(csp).not.toMatch(/script-src[^;]*'unsafe-inline'/);
    expect(csp).not.toMatch(/script-src[^;]*'unsafe-eval'/);
  });

  it("development keeps unsafe-inline + unsafe-eval and no nonce", () => {
    const csp = buildContentSecurityPolicy({ isDev: true });
    expect(csp).toContain("script-src 'self' 'unsafe-inline' 'unsafe-eval'");
    expect(csp).not.toContain("nonce-");
    expect(csp).not.toContain("strict-dynamic");
  });

  it("keeps the shared directives in both modes", () => {
    for (const csp of [
      buildContentSecurityPolicy({ nonce: "n", isDev: false }),
      buildContentSecurityPolicy({ isDev: true }),
    ]) {
      expect(csp).toContain("default-src 'self'");
      expect(csp).toContain("connect-src 'self' wss: https:");
      expect(csp).toContain("frame-ancestors 'none'");
      expect(csp).toContain("base-uri 'self'");
      expect(csp).toContain("form-action 'self'");
      expect(csp).toContain("img-src 'self' data: blob: https:");
    }
  });
});
