// @vitest-environment node
import { describe, it, expect } from "vitest";
import { slugifyDisplayName, hasPayoutConfigured } from "@/lib/creator/users";
import type { User } from "@/lib/creator/users";

// Minimal User stub that satisfies hasPayoutConfigured's reads. The
// helper only inspects four columns; the rest are filler so the cast
// stays type-safe without dragging in a full row factory.
function makeUser(overrides: Partial<User>): User {
  return {
    id: "00000000-0000-0000-0000-000000000000",
    pubkey: "pk",
    slug: "user-x",
    display_name: "X",
    bio: null,
    avatar_url: null,
    banner_url: null,
    cbu: null,
    alias: null,
    lightning_address: null,
    payout_method: "cbu_alias",
    features_autorenewal: false,
    locale: "es",
    notification_prefs: {},
    active: true,
    deleted_at: null,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  } as User;
}

describe("slugifyDisplayName", () => {
  it("lowercases and hyphenates word boundaries", () => {
    expect(slugifyDisplayName("Profe Bitcoin")).toBe("profe-bitcoin");
    expect(slugifyDisplayName("Maria Lopez")).toBe("maria-lopez");
  });

  it("strips diacritical marks via NFKD", () => {
    expect(slugifyDisplayName("Joaquín Acosta")).toBe("joaquin-acosta");
    expect(slugifyDisplayName("Sofía Pérez")).toBe("sofia-perez");
    expect(slugifyDisplayName("María-José")).toBe("maria-jose");
    // ñ decomposes to n + combining tilde, the tilde is stripped
    expect(slugifyDisplayName("Año Nuevo")).toBe("ano-nuevo");
  });

  it("collapses runs of separator characters", () => {
    expect(slugifyDisplayName("a   b\t\nc")).toBe("a-b-c");
    expect(slugifyDisplayName("foo___bar")).toBe("foo-bar");
  });

  it("trims leading/trailing hyphens", () => {
    expect(slugifyDisplayName("--hello--")).toBe("hello");
    expect(slugifyDisplayName("   leading spaces")).toBe("leading-spaces");
  });

  it("drops emoji and other non-ASCII chars to nothing", () => {
    expect(slugifyDisplayName("🚀 Rocket Profe")).toBe("rocket-profe");
    expect(slugifyDisplayName("漢字 mixed")).toBe("mixed");
  });

  it("truncates to 40 characters and re-trims trailing hyphens", () => {
    const long = "a".repeat(50);
    const result = slugifyDisplayName(long);
    expect(result?.length).toBeLessThanOrEqual(40);
    expect(result).not.toMatch(/-$/);
  });

  it("returns null when the result is shorter than 3 characters", () => {
    expect(slugifyDisplayName("ab")).toBeNull();
    expect(slugifyDisplayName("a")).toBeNull();
    expect(slugifyDisplayName("")).toBeNull();
    expect(slugifyDisplayName("🚀")).toBeNull();
  });

  it("returns null for reserved route slugs", () => {
    expect(slugifyDisplayName("settings")).toBeNull();
    expect(slugifyDisplayName("My Courses")).toBeNull();
    expect(slugifyDisplayName("Orders")).toBeNull();
    expect(slugifyDisplayName("admin")).toBeNull();
    expect(slugifyDisplayName("api")).toBeNull();
    expect(slugifyDisplayName("panel")).toBeNull(); // legacy
  });

  it("handles names that produce only hyphens or empty after stripping", () => {
    expect(slugifyDisplayName("---")).toBeNull();
    expect(slugifyDisplayName("@@@")).toBeNull();
  });
});

describe("hasPayoutConfigured", () => {
  it("rejects an empty cbu_alias seller", () => {
    expect(hasPayoutConfigured(makeUser({ payout_method: "cbu_alias" }))).toBe(
      false
    );
  });

  it("accepts a cbu_alias seller with just an alias", () => {
    expect(
      hasPayoutConfigured(
        makeUser({ payout_method: "cbu_alias", alias: "mi.alias" })
      )
    ).toBe(true);
  });

  it("accepts a cbu_alias seller with just a cbu", () => {
    expect(
      hasPayoutConfigured(
        makeUser({
          payout_method: "cbu_alias",
          cbu: "0000003100010000000001",
        })
      )
    ).toBe(true);
  });

  it("rejects a cbu_alias seller with only whitespace fields", () => {
    expect(
      hasPayoutConfigured(
        makeUser({
          payout_method: "cbu_alias",
          cbu: "   ",
          alias: " \t",
        })
      )
    ).toBe(false);
  });

  it("rejects a lightning_address seller with no LN address", () => {
    expect(
      hasPayoutConfigured(makeUser({ payout_method: "lightning_address" }))
    ).toBe(false);
  });

  it("rejects a lightning_address seller even if cbu/alias are present", () => {
    expect(
      hasPayoutConfigured(
        makeUser({
          payout_method: "lightning_address",
          cbu: "0000003100010000000001",
          alias: "mi.alias",
        })
      )
    ).toBe(false);
  });

  it("accepts a lightning_address seller with an LN address", () => {
    expect(
      hasPayoutConfigured(
        makeUser({
          payout_method: "lightning_address",
          lightning_address: "me@walletofsatoshi.com",
        })
      )
    ).toBe(true);
  });
});
