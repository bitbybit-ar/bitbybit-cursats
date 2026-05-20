import { ImageResponse } from "next/og";
import { getTranslations } from "next-intl/server";

export const alt = "BitByBit Cursats";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

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
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "16px",
          fontSize: "32px",
          opacity: 0.85,
        }}
      >
        <div style={{ display: "flex", gap: "4px" }}>
          <div
            style={{
              display: "flex",
              width: "32px",
              height: "32px",
              borderRadius: "6px",
              background: "#8B5CF6",
            }}
          />
          <div
            style={{
              display: "flex",
              width: "32px",
              height: "32px",
              borderRadius: "6px",
              background: "#F7A825",
            }}
          />
          <div
            style={{
              display: "flex",
              width: "32px",
              height: "32px",
              borderRadius: "6px",
              background: "#22C55E",
            }}
          />
        </div>
        <span>BitByBit Cursats</span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
        <div
          style={{
            display: "flex",
            fontSize: "84px",
            fontWeight: 800,
            lineHeight: 1.05,
            maxWidth: "1040px",
          }}
        >
          {t("ogHeadline")}
        </div>
        <div
          style={{
            display: "flex",
            fontSize: "28px",
            opacity: 0.85,
            maxWidth: "960px",
            lineHeight: 1.3,
          }}
        >
          {t("ogTagline")}
        </div>
      </div>
    </div>,
    size
  );
}
