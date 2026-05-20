// @vitest-environment node
import { describe, it, expect } from "vitest";
import { Hex64Schema, LightningAddressSchema } from "@/lib/schemas/primitives";

describe("Hex64Schema (sanity check that the existing schema still parses)", () => {
  it("accepts a 64-char hex string and lowercases", () => {
    const out = Hex64Schema.parse("ABCDEF" + "0".repeat(58));
    expect(out).toBe("abcdef" + "0".repeat(58));
  });

  it("rejects strings of the wrong length", () => {
    expect(Hex64Schema.safeParse("abc").success).toBe(false);
  });
});

describe("LightningAddressSchema", () => {
  it("accepts well-formed addresses", () => {
    expect(LightningAddressSchema.parse("alice@walletofsatoshi.com")).toBe(
      "alice@walletofsatoshi.com"
    );
    expect(LightningAddressSchema.parse("foo.bar+1@strike.me")).toBe(
      "foo.bar+1@strike.me"
    );
  });

  it("trims whitespace around the input", () => {
    expect(LightningAddressSchema.parse("  alice@strike.me  ")).toBe(
      "alice@strike.me"
    );
  });

  it("rejects malformed inputs with a discriminating error message", () => {
    const cases = [
      "",
      "nope",
      "alice@",
      "@strike.me",
      "alice@localhost",
      "alice@strike",
    ];
    for (const c of cases) {
      const result = LightningAddressSchema.safeParse(c);
      expect(result.success, `expected reject: ${c}`).toBe(false);
      if (!result.success) {
        // The refinement message is `lightning_address_invalid` so the
        // settings PATCH route can map it to the user-facing toast.
        const messages = result.error.issues.map((i) => i.message);
        expect(messages).toContain("lightning_address_invalid");
      }
    }
  });

  it("rejects addresses longer than 128 characters", () => {
    const long = "a".repeat(129) + "@strike.me";
    expect(LightningAddressSchema.safeParse(long).success).toBe(false);
  });
});
