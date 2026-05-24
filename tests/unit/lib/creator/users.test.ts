// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  slugifyDisplayName,
  hasPayoutConfigured,
  expectedPriceCurrency,
  kind0RefreshPatch,
  UpdateUserProfileSchema,
} from "@/lib/creator/users";
import type { User } from "@/lib/creator/users";
import type { Kind0Profile } from "@/lib/nostr/profile";

// 8-hex-prefixed pubkey so the placeholder name is deterministic.
const PUBKEY = "abc12345" + "f".repeat(56);
const PLACEHOLDER_NAME = "user-abc12345";

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
    nostr_lightning_address: null,
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

describe("expectedPriceCurrency", () => {
  it("prices a cbu_alias (Wapu) seller in ARS", () => {
    expect(expectedPriceCurrency(makeUser({ payout_method: "cbu_alias" }))).toBe(
      "ars"
    );
  });

  it("prices a lightning_address seller in sats", () => {
    expect(
      expectedPriceCurrency(makeUser({ payout_method: "lightning_address" }))
    ).toBe("sats");
  });
});

describe("kind0RefreshPatch", () => {
  const fullProfile: Kind0Profile = {
    display_name: "Profe Bitcoin",
    picture: "https://example.com/a.png",
    banner: "https://example.com/b.png",
    about: "I teach sats",
    lud16: "profe@primal.net",
  };

  it("refreshes display_name only while it equals the placeholder", () => {
    const patch = kind0RefreshPatch(
      makeUser({ pubkey: PUBKEY, display_name: PLACEHOLDER_NAME }),
      fullProfile
    );
    expect(patch.display_name).toBe("Profe Bitcoin");
  });

  it("never clobbers a real/edited display_name", () => {
    const patch = kind0RefreshPatch(
      makeUser({ pubkey: PUBKEY, display_name: "My Real Name" }),
      fullProfile
    );
    expect(patch.display_name).toBeUndefined();
  });

  it("falls back to kind:0 `name` when `display_name` is absent", () => {
    const patch = kind0RefreshPatch(
      makeUser({ pubkey: PUBKEY, display_name: PLACEHOLDER_NAME }),
      { name: "shorthand" }
    );
    expect(patch.display_name).toBe("shorthand");
  });

  it("fills empty avatar/banner/bio/nostr-address from kind:0", () => {
    const patch = kind0RefreshPatch(
      makeUser({ pubkey: PUBKEY, display_name: PLACEHOLDER_NAME }),
      fullProfile
    );
    expect(patch.avatar_url).toBe("https://example.com/a.png");
    expect(patch.banner_url).toBe("https://example.com/b.png");
    expect(patch.bio).toBe("I teach sats");
    // The public Nostr address is filled even though primal.net has no
    // LUD-21 — no validation runs on this field (ADR 0030).
    expect(patch.nostr_lightning_address).toBe("profe@primal.net");
  });

  it("preserves fields the user has already set", () => {
    const patch = kind0RefreshPatch(
      makeUser({
        pubkey: PUBKEY,
        display_name: "My Real Name",
        avatar_url: "https://mine/a.png",
        banner_url: "https://mine/b.png",
        bio: "my bio",
        nostr_lightning_address: "me@alby.com",
      }),
      fullProfile
    );
    expect(patch).toEqual({});
  });

  it("treats whitespace-only existing values as empty", () => {
    const patch = kind0RefreshPatch(
      makeUser({ pubkey: PUBKEY, display_name: PLACEHOLDER_NAME, bio: "   " }),
      { about: "real bio" }
    );
    expect(patch.bio).toBe("real bio");
  });

  it("returns an empty patch when kind:0 carries nothing useful", () => {
    const patch = kind0RefreshPatch(
      makeUser({ pubkey: PUBKEY, display_name: PLACEHOLDER_NAME }),
      {}
    );
    expect(patch).toEqual({});
  });

  it("never proposes a slug change", () => {
    const patch = kind0RefreshPatch(
      makeUser({ pubkey: PUBKEY, display_name: PLACEHOLDER_NAME }),
      fullProfile
    );
    expect(patch).not.toHaveProperty("slug");
  });
});

describe("UpdateUserProfileSchema — nostr_lightning_address", () => {
  it("accepts a well-formed public Nostr address (no LUD-21 check)", () => {
    const parsed = UpdateUserProfileSchema.safeParse({
      nostr_lightning_address: "profe@primal.net",
    });
    expect(parsed.success).toBe(true);
  });

  it("accepts null (clearing the field)", () => {
    const parsed = UpdateUserProfileSchema.safeParse({
      nostr_lightning_address: null,
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects a malformed address (format check still applies)", () => {
    const parsed = UpdateUserProfileSchema.safeParse({
      nostr_lightning_address: "not-an-address",
    });
    expect(parsed.success).toBe(false);
  });
});
