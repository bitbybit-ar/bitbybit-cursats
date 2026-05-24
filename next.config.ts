import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const nextConfig: NextConfig = {
  sassOptions: {
    includePaths: [process.cwd()],
  },
  images: {
    remotePatterns: [{ protocol: "https", hostname: "**" }],
    // Allow SVG through next/image. Friend logos are sometimes only
    // distributed as SVG (e.g., Mapping Bitcoin). The accompanying
    // contentSecurityPolicy locks served images to a sandbox so a
    // malicious SVG can't ship inline scripts or load external refs.
    dangerouslyAllowSVG: true,
    contentDispositionType: "attachment",
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          // Content-Security-Policy is NOT set here. It needs a unique
          // per-request nonce so we can drop `script-src 'unsafe-inline'`,
          // and a static next.config header can't carry one. It is built
          // and attached in `proxy.ts` (see lib/csp.ts).
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
