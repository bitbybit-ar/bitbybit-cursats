import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { ImageResponse } from "next/og";
import { getTranslations } from "next-intl/server";

export const alt = "CURSATS";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Same three hues as <LogoBlocks /> and <Wordmark />: brand blue,
// lime, pink. Kept inline because Satori can't read the SCSS tokens.
const BLOCK_COLORS = ["#3b82f6", "#a5ce3a", "#ed3b95"];
const SATS_GRADIENT =
  "linear-gradient(90deg, #3b82f6 0%, #a5ce3a 50%, #ed3b95 100%)";
const SITE_HOST = "cursats.bitbybit.com.ar";

// One brand lockup, sized to dominate the card: the stacked colour
// blocks (the logo mark) sitting next to a giant CURSATS wordmark.
// There is intentionally no second small lockup — the hero *is* the
// logo. Block height tracks the wordmark cap height so the mark and
// the type read as a single unit.
const WORDMARK_SIZE = 188;
const BLOCK = 58;
const BLOCK_GAP = 8;

// The brand display face (Nunito) loaded into Satori so the wordmark
// renders in real platform type, not Satori's fallback sans. WOFF
// (not WOFF2) is the format Satori can parse; the files are vendored
// under `_fonts/` and resolved relative to this module so Next traces
// them into the build.
async function loadBrandFonts() {
  const [regular, extraBold] = await Promise.all([
    readFile(
      fileURLToPath(new URL("./_fonts/Nunito-Regular.woff", import.meta.url))
    ),
    readFile(
      fileURLToPath(new URL("./_fonts/Nunito-ExtraBold.woff", import.meta.url))
    ),
  ]);
  return [
    {
      name: "Nunito",
      data: regular,
      weight: 400 as const,
      style: "normal" as const,
    },
    {
      name: "Nunito",
      data: extraBold,
      weight: 800 as const,
      style: "normal" as const,
    },
  ];
}

// "CUR" in near-white, "SATS" painted with the brand gradient via
// background-clip:text — the same split the real <Wordmark /> renders.
function Wordmark({ fontSize }: { fontSize: number }) {
  return (
    <div
      style={{
        display: "flex",
        fontSize,
        fontWeight: 800,
        letterSpacing: fontSize * -0.025,
        lineHeight: 1,
      }}
    >
      <span style={{ color: "#F5F5FA" }}>CUR</span>
      <span
        style={{
          backgroundImage: SATS_GRADIENT,
          backgroundClip: "text",
          WebkitBackgroundClip: "text",
          color: "transparent",
        }}
      >
        SATS
      </span>
    </div>
  );
}

export default async function OgImage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "metadata" });
  const fonts = await loadBrandFonts();

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "76px 84px",
        background:
          "linear-gradient(135deg, #0F0F1A 0%, #1A1A2E 55%, #2A1F4A 100%)",
        color: "#FFFFFF",
        fontFamily: "Nunito",
      }}
    >
      {/* Empty top rail — with space-between it balances the footer
            so the hero lockup lands on the vertical centre. */}
      <div style={{ display: "flex" }} />

      {/* Hero — the logo mark + giant CURSATS as one lockup, with a
            single value line underneath. No headline/tagline here;
            those live in the link title and description. */}
      <div style={{ display: "flex", flexDirection: "column", gap: "32px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "32px" }}>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: `${BLOCK_GAP}px`,
            }}
          >
            {BLOCK_COLORS.map((color) => (
              <div
                key={color}
                style={{
                  display: "flex",
                  width: `${BLOCK}px`,
                  height: `${BLOCK}px`,
                  borderRadius: "13px",
                  background: color,
                }}
              />
            ))}
          </div>
          <Wordmark fontSize={WORDMARK_SIZE} />
        </div>
        <div
          style={{
            display: "flex",
            fontSize: "40px",
            fontWeight: 400,
            lineHeight: 1.2,
            color: "rgba(255, 255, 255, 0.82)",
          }}
        >
          {t("ogValueLine")}
        </div>
      </div>

      {/* Footer — domain, right-aligned */}
      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          fontSize: "27px",
          fontWeight: 400,
          color: "rgba(255, 255, 255, 0.5)",
        }}
      >
        {SITE_HOST}
      </div>
    </div>,
    { ...size, fonts }
  );
}
