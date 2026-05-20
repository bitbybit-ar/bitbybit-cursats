import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

// React's dev tooling (source-map reconstruction, fast refresh stack
// recovery) calls `eval()`. Production never does. Adding `'unsafe-
// eval'` only in development keeps the prod CSP tight while letting
// `next dev` work without CSP errors.
const isDev = process.env.NODE_ENV !== "production";
const scriptSrc = isDev
  ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
  : "script-src 'self' 'unsafe-inline'";

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
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              scriptSrc,
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "font-src 'self' data: https://fonts.gstatic.com",
              "img-src 'self' data: blob: https:",
              // wss: allows the NIP-46 Nostr Connect flow to open
              // relay channels (relay.nsec.app, relay.damus.io, …)
              // *and* any relay a user-pasted bunker:// URL points
              // at — listing fixed origins would break the moment a
              // signer app advertises a new relay. https: covers
              // outbound requests to external APIs (e.g. nostr.band
              // metadata lookups). 'self' stays for our own /api/*.
              "connect-src 'self' wss: https:",
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self'",
            ].join("; "),
          },
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
