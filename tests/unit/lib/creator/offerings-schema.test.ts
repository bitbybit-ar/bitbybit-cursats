// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  CreateOfferingSchema,
  UpdateOfferingSchema,
  normalizeTags,
  MAX_TAGS_PER_OFFERING,
} from "@/lib/creator/offerings";

// The route handlers (POST/PATCH /api/my-courses) trust these schemas
// to reject malformed bodies before anything touches the DB. The
// download_url https refinement is load-bearing security — the download
// proxy 302-redirects to it after a buyer pays, so a javascript:/http:
// value would be a phishing/downgrade vector.

const validCode = {
  slug: "intro-bitcoin",
  type: "code" as const,
  title: "Intro a Bitcoin",
  description: "Taller online.",
  price_amount: 5000,
  price_currency: "ars" as const,
  image_url: "https://example.com/cover.png",
  code_count: 10,
};

const validDownload = {
  slug: "sheet-music",
  type: "download" as const,
  title: "Partitura",
  description: "PDF de la clase.",
  price_amount: 200,
  price_currency: "sats" as const,
  image_url: "https://example.com/cover.png",
  download_url: "https://files.example.com/score.pdf",
};

describe("CreateOfferingSchema — code offerings", () => {
  it("accepts a well-formed code offering and defaults tags to []", () => {
    const parsed = CreateOfferingSchema.safeParse(validCode);
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.tags).toEqual([]);
  });

  it("rejects a code offering with no code_count", () => {
    const { code_count: _omit, ...noCount } = validCode;
    const parsed = CreateOfferingSchema.safeParse(noCount);
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues.some((i) => i.path.includes("code_count"))).toBe(
        true
      );
    }
  });

  it("rejects code_count below 1 or above the 10 000 mint ceiling", () => {
    expect(
      CreateOfferingSchema.safeParse({ ...validCode, code_count: 0 }).success
    ).toBe(false);
    expect(
      CreateOfferingSchema.safeParse({ ...validCode, code_count: 10_001 }).success
    ).toBe(false);
  });
});

describe("CreateOfferingSchema — download offerings", () => {
  it("accepts a download offering with an https download_url", () => {
    expect(CreateOfferingSchema.safeParse(validDownload).success).toBe(true);
  });

  it("rejects a download offering with no download_url", () => {
    const { download_url: _omit, ...noUrl } = validDownload;
    const parsed = CreateOfferingSchema.safeParse(noUrl);
    expect(parsed.success).toBe(false);
  });

  it("rejects a non-https download_url (http downgrade)", () => {
    const parsed = CreateOfferingSchema.safeParse({
      ...validDownload,
      download_url: "http://files.example.com/score.pdf",
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects a javascript: download_url (phishing vector)", () => {
    const parsed = CreateOfferingSchema.safeParse({
      ...validDownload,
      download_url: "javascript:alert(1)",
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects a data: download_url", () => {
    const parsed = CreateOfferingSchema.safeParse({
      ...validDownload,
      download_url: "data:text/html,<script>alert(1)</script>",
    });
    expect(parsed.success).toBe(false);
  });
});

describe("CreateOfferingSchema — shared field constraints", () => {
  it("rejects a non-kebab slug", () => {
    expect(
      CreateOfferingSchema.safeParse({ ...validCode, slug: "Intro Bitcoin" })
        .success
    ).toBe(false);
    expect(
      CreateOfferingSchema.safeParse({ ...validCode, slug: "intro_bitcoin" })
        .success
    ).toBe(false);
  });

  it("rejects a non-positive or non-integer price_amount", () => {
    expect(
      CreateOfferingSchema.safeParse({ ...validCode, price_amount: 0 }).success
    ).toBe(false);
    expect(
      CreateOfferingSchema.safeParse({ ...validCode, price_amount: -5 }).success
    ).toBe(false);
    expect(
      CreateOfferingSchema.safeParse({ ...validCode, price_amount: 12.5 }).success
    ).toBe(false);
  });

  it("rejects an empty title or one over 200 chars", () => {
    expect(
      CreateOfferingSchema.safeParse({ ...validCode, title: "" }).success
    ).toBe(false);
    expect(
      CreateOfferingSchema.safeParse({ ...validCode, title: "x".repeat(201) })
        .success
    ).toBe(false);
  });

  it("rejects an image_url that is not a URL", () => {
    expect(
      CreateOfferingSchema.safeParse({ ...validCode, image_url: "not-a-url" })
        .success
    ).toBe(false);
  });

  it("dedupes tags and rejects more than the per-offering cap", () => {
    const ok = CreateOfferingSchema.safeParse({
      ...validCode,
      tags: ["btc", "btc", "lightning"],
    });
    expect(ok.success).toBe(true);
    if (ok.success) expect(ok.data.tags).toEqual(["btc", "lightning"]);

    const tooMany = CreateOfferingSchema.safeParse({
      ...validCode,
      tags: Array.from({ length: MAX_TAGS_PER_OFFERING + 1 }, (_, i) => `t${i}`),
    });
    expect(tooMany.success).toBe(false);
  });

  it("rejects a non-kebab tag", () => {
    expect(
      CreateOfferingSchema.safeParse({ ...validCode, tags: ["Not A Tag"] })
        .success
    ).toBe(false);
  });
});

describe("UpdateOfferingSchema", () => {
  it("accepts an empty patch (all fields optional)", () => {
    expect(UpdateOfferingSchema.safeParse({}).success).toBe(true);
  });

  it("accepts a partial price-only patch", () => {
    expect(UpdateOfferingSchema.safeParse({ price_amount: 1500 }).success).toBe(
      true
    );
  });

  it("rejects type=download with no download_url", () => {
    expect(UpdateOfferingSchema.safeParse({ type: "download" }).success).toBe(
      false
    );
  });

  it("accepts type=download with an https download_url", () => {
    expect(
      UpdateOfferingSchema.safeParse({
        type: "download",
        download_url: "https://files.example.com/x.pdf",
      }).success
    ).toBe(true);
  });
});

describe("normalizeTags (defence-in-depth server scrub)", () => {
  it("lowercases, hyphenates whitespace, and strips diacritics", () => {
    expect(normalizeTags(["Música Clásica"])).toEqual(["musica-clasica"]);
    expect(normalizeTags(["a  b"])).toEqual(["a-b"]);
  });

  it("collapses runs of hyphens and trims edge hyphens", () => {
    expect(normalizeTags(["c--d", "-edge-"])).toEqual(["c-d", "edge"]);
  });

  it("dedupes case-insensitively", () => {
    expect(normalizeTags(["BTC", "btc", "Btc"])).toEqual(["btc"]);
  });

  it("drops empty / punctuation-only / over-length tags", () => {
    expect(normalizeTags(["!!!", "", "a".repeat(40)])).toEqual([]);
  });

  it("caps the result at the per-offering maximum", () => {
    const many = Array.from({ length: 20 }, (_, i) => `tag-${i}`);
    expect(normalizeTags(many)).toHaveLength(MAX_TAGS_PER_OFFERING);
  });

  it("returns [] for undefined", () => {
    expect(normalizeTags(undefined)).toEqual([]);
  });
});
