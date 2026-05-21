// @vitest-environment node
import { describe, it, expect } from "vitest";
import { serializeJsonLd } from "@/lib/jsonld";

const LS = String.fromCharCode(0x2028);
const PS = String.fromCharCode(0x2029);

describe("jsonld/serializeJsonLd", () => {
  it("produces stringified JSON for a plain object", () => {
    const out = serializeJsonLd({ "@type": "WebSite", name: "X" });
    expect(JSON.parse(out)).toEqual({ "@type": "WebSite", name: "X" });
  });

  it("escapes </script so a value cannot break out of the script tag", () => {
    const out = serializeJsonLd({
      note: "</script><img src=x onerror=alert(1)>",
    });
    expect(out).not.toMatch(/<\/script/i);
    expect(out).toContain("<\\/script");
  });

  it("escapes <!-- so a value cannot open an HTML comment", () => {
    const out = serializeJsonLd({ note: "<!-- swallow markup -->" });
    expect(out).not.toContain("<!--");
    expect(out).toContain("<\\!--");
  });

  it("escapes U+2028 and U+2029 (JSON-valid, JS-line-terminator)", () => {
    const out = serializeJsonLd({ note: "a" + LS + "b" + PS + "c" });
    expect(out.includes(LS)).toBe(false);
    expect(out.includes(PS)).toBe(false);
    expect(out).toContain("\\u2028");
    expect(out).toContain("\\u2029");
  });

  it("preserves legitimate < / > characters outside the unsafe sequences", () => {
    const out = serializeJsonLd({ note: "1 < 2 and 3 > 0" });
    expect(JSON.parse(out)).toEqual({ note: "1 < 2 and 3 > 0" });
  });
});
