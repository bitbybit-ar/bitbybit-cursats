// @vitest-environment node
import { describe, it, expect } from "vitest";
import { isValidRedeemUrl } from "@/lib/creator/redeem-url";

// `redeem_url` is rendered as a link on the receipt's "Contact the
// teacher" card, so the accepted-protocol rule is load-bearing: http:
// is a downgrade vector and javascript:/data: are XSS vectors. The
// same function backs both the Zod API schema and the create-course
// form's inline check, so these cases pin both at once.

describe("isValidRedeemUrl", () => {
  it("accepts https, mailto:, and tel:", () => {
    expect(isValidRedeemUrl("https://example.com/redeem")).toBe(true);
    expect(isValidRedeemUrl("https://wa.me/5491100000000")).toBe(true);
    expect(isValidRedeemUrl("https://t.me/teacher")).toBe(true);
    expect(isValidRedeemUrl("mailto:teacher@example.com")).toBe(true);
    expect(isValidRedeemUrl("tel:+5491100000000")).toBe(true);
  });

  it("trims surrounding whitespace before validating", () => {
    expect(isValidRedeemUrl("  https://example.com/redeem  ")).toBe(true);
  });

  it("rejects http: (downgrade) and other disallowed protocols", () => {
    expect(isValidRedeemUrl("http://example.com/redeem")).toBe(false);
    expect(isValidRedeemUrl("ftp://example.com/file")).toBe(false);
    expect(isValidRedeemUrl("javascript:alert(1)")).toBe(false);
    expect(isValidRedeemUrl("data:text/html,<script>alert(1)</script>")).toBe(
      false
    );
  });

  it("rejects empty and malformed values", () => {
    expect(isValidRedeemUrl("")).toBe(false);
    expect(isValidRedeemUrl("   ")).toBe(false);
    expect(isValidRedeemUrl("not-a-url")).toBe(false);
    expect(isValidRedeemUrl("example.com")).toBe(false);
  });
});
