import { ImageResponse } from "next/og";
import { getTranslations } from "next-intl/server";

export const alt = "Cursats";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Same three hues as <LogoBlocks /> and <Wordmark />: brand blue,
// lime, pink. Kept inline because Satori can't read the SCSS tokens.
const BLOCK_COLORS = ["#3b82f6", "#a5ce3a", "#ed3b95"];
const SATS_GRADIENT =
  "linear-gradient(90deg, #3b82f6 0%, #a5ce3a 50%, #ed3b95 100%)";
const SITE_HOST = "cursats.bitbybit.com.ar";

// "CUR" in near-white, "SATS" painted with the brand gradient via
// background-clip:text — the same split the real <Wordmark /> renders.
function Wordmark({ fontSize }: { fontSize: number }) {
  return (
    <div
      style={{
        display: "flex",
        fontSize,
        fontWeight: 800,
        letterSpacing: fontSize * -0.02,
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

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "80px",
        background:
          "linear-gradient(135deg, #0F0F1A 0%, #1A1A2E 55%, #2A1F4A 100%)",
        color: "#FFFFFF",
        fontFamily: "sans-serif",
      }}
    >
      {/* Brand lockup — vertically stacked blocks + CURSATS wordmark */}
      <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
          {BLOCK_COLORS.map((color) => (
            <div
              key={color}
              style={{
                display: "flex",
                width: "26px",
                height: "26px",
                borderRadius: "6px",
                background: color,
              }}
            />
          ))}
        </div>
        <Wordmark fontSize={40} />
      </div>

      {/* Hero — giant wordmark + a single value line (no headline /
          tagline, those live in the link title and description). */}
      <div style={{ display: "flex", flexDirection: "column", gap: "28px" }}>
        <Wordmark fontSize={170} />
        <div
          style={{
            display: "flex",
            fontSize: "38px",
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
          fontSize: "26px",
          color: "rgba(255, 255, 255, 0.5)",
        }}
      >
        {SITE_HOST}
      </div>
    </div>,
    size
  );
}
