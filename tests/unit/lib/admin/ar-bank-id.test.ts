// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  checkAlias,
  checkCbu,
  checkUserSlug,
  classifyPayoutDestination,
  RESERVED_SLUGS,
  AliasSchema,
  CbuSchema,
  UserSlugSchema,
} from "@/lib/admin/ar-bank-id";

describe("admin/ar-bank-id/checkAlias", () => {
  it("accepts a BCRA-shaped alias", () => {
    expect(checkAlias("juan.perez.mp")).toBeNull();
    expect(checkAlias("ABC.123")).toBeNull();
    expect(checkAlias("a1.b2.c3")).toBeNull();
  });

  it("rejects an alias that is too short or too long", () => {
    expect(checkAlias("ab.cd")).toBe("length");
    expect(checkAlias("a".repeat(21))).toBe("length");
  });

  it("rejects an alias that has only digits (looks like a CBU paste)", () => {
    expect(checkAlias("123456")).toBe("no_letter");
    expect(checkAlias("0000003100000000000001")).toBe("length");
  });

  it("rejects unsupported punctuation", () => {
    expect(checkAlias("juan_perez")).toBe("format");
    expect(checkAlias("juan perez")).toBe("format");
    expect(checkAlias("juan*perez")).toBe("format");
  });

  it("trims surrounding whitespace before validating", () => {
    expect(checkAlias("  juan.perez.mp  ")).toBeNull();
  });
});

describe("admin/ar-bank-id/checkCbu", () => {
  it("accepts a 22-digit CBU", () => {
    expect(checkCbu("0000003100000000000001")).toBeNull();
  });

  it("rejects anything that is not exactly 22 digits", () => {
    expect(checkCbu("123")).toBe("format");
    expect(checkCbu("0".repeat(21))).toBe("format");
    expect(checkCbu("0".repeat(23))).toBe("format");
    expect(checkCbu("000000310000000000000A")).toBe("format");
  });
});

describe("admin/ar-bank-id/checkUserSlug", () => {
  it("accepts a clean kebab slug", () => {
    expect(checkUserSlug("juana-perez")).toBeNull();
    expect(checkUserSlug("hello")).toBeNull();
  });

  it("rejects slugs that hit the length bounds", () => {
    expect(checkUserSlug("ab")).toBe("length");
    expect(checkUserSlug("a".repeat(41))).toBe("length");
  });

  it("rejects malformed slugs", () => {
    expect(checkUserSlug("-leading")).toBe("format");
    expect(checkUserSlug("trailing-")).toBe("format");
    expect(checkUserSlug("double--hyphen")).toBe("format");
    expect(checkUserSlug("has spaces")).toBe("format");
    expect(checkUserSlug("under_score")).toBe("format");
  });

  it("lowercases case before applying the format rule", () => {
    // The validator normalises case first; the form is expected to
    // accept "Juana" and store "juana" rather than rejecting on caps.
    expect(checkUserSlug("Juana-Perez")).toBeNull();
  });

  it("rejects every format-valid reserved slug with reason=reserved", () => {
    // The reserved set also includes entries that fail earlier
    // checks (length<3 for `c`/`m`, leading underscore for `_next`).
    // Those surface as their own error first; the assertion below
    // covers slugs that reach the reserved gate.
    const kebab = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
    for (const slug of RESERVED_SLUGS) {
      if (slug.length < 3 || !kebab.test(slug)) continue;
      expect(checkUserSlug(slug)).toBe("reserved");
    }
  });

  it("reserves the single-letter routing segments c and m (ADR 0017)", () => {
    expect(checkUserSlug("c")).toBe("length");
    expect(checkUserSlug("m")).toBe("length");
    expect(RESERVED_SLUGS.has("c")).toBe(true);
    expect(RESERVED_SLUGS.has("m")).toBe(true);
  });

  it("normalises case before checking the reserved set", () => {
    expect(checkUserSlug("Settings")).toBe("reserved");
    expect(checkUserSlug("  EXPLORE ")).toBe("reserved");
  });
});

describe("admin/ar-bank-id/classifyPayoutDestination", () => {
  it("returns kind=cbu for a 22-digit string", () => {
    const result = classifyPayoutDestination("0000003100000000000001");
    expect(result).toEqual({
      kind: "cbu",
      value: "0000003100000000000001",
    });
  });

  it("returns kind=alias for a BCRA-shaped alias", () => {
    const result = classifyPayoutDestination("juana.perez.mp");
    expect(result).toEqual({ kind: "alias", value: "juana.perez.mp" });
  });

  it("returns null for unrecognisable input", () => {
    expect(classifyPayoutDestination("not a payment id")).toBeNull();
    expect(classifyPayoutDestination("")).toBeNull();
  });
});

describe("admin/ar-bank-id/zod schemas", () => {
  it("AliasSchema rejects with a stable error code", () => {
    const r = AliasSchema.safeParse("bad alias");
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0].message).toBe("alias_invalid");
    }
  });

  it("CbuSchema rejects with a stable error code", () => {
    const r = CbuSchema.safeParse("not-a-cbu");
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0].message).toBe("cbu_invalid");
    }
  });

  it("UserSlugSchema lowercases and rejects reserved slugs", () => {
    const r = UserSlugSchema.safeParse("API");
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0].message).toBe("slug_invalid");
    }
  });

  it("UserSlugSchema lowercases and trims before refining", () => {
    const r = UserSlugSchema.safeParse("  Juana-Perez  ");
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data).toBe("juana-perez");
    }
  });
});
