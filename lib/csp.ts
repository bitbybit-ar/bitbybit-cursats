// Content-Security-Policy construction. Kept dependency-free and on
// Web APIs only (crypto.getRandomValues, btoa) so it runs on the edge
// runtime where `proxy.ts` mints a per-request nonce.
//
// Why nonce-based instead of a static header in next.config.ts:
// Next.js emits inline bootstrap/hydration <script>s, so the only way
// to drop `script-src 'unsafe-inline'` (under which an injected inline
// <script> would execute) is to authorize the known-good inline
// scripts with a per-request nonce. The nonce is minted in the proxy,
// threaded onto the request headers (Next reads it from the request
// CSP header and stamps its own scripts; we stamp the JSON-LD and the
// next-themes script in the layout), and echoed on the response.

/**
 * Mint a fresh CSP nonce: 16 random bytes, base64-encoded. Generated
 * per request so a `'nonce-…'` source can authorize exactly the inline
 * scripts we rendered this turn and nothing an attacker could inject.
 */
export function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/**
 * Build the CSP header value.
 *
 * Production locks `script-src` to `'self' 'nonce-…' 'strict-dynamic'`
 * — no `'unsafe-inline'`, so an injected inline `<script>` (or a
 * `src`-attribute one an attacker plants) is refused; only our nonced
 * scripts and those they load run.
 *
 * Development keeps `'unsafe-inline' 'unsafe-eval'` and no nonce:
 * `next dev`'s fast-refresh / source-map tooling injects un-nonced
 * inline scripts and calls `eval()`, which `'strict-dynamic'` + nonce
 * would break. Production never does either.
 */
export function buildContentSecurityPolicy(opts: {
  nonce?: string;
  isDev: boolean;
}): string {
  const { nonce, isDev } = opts;
  const scriptSrc = isDev
    ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
    : `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`;

  return [
    "default-src 'self'",
    scriptSrc,
    // Styles stay 'unsafe-inline': sass-emitted critical CSS and the
    // next-themes anti-FOUC <style> are inline, and CSS injection is a
    // far lower-severity surface than script injection.
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    "img-src 'self' data: blob: https:",
    // wss: allows the NIP-46 Nostr Connect flow to open relay channels
    // (relay.nsec.app, relay.damus.io, …) *and* any relay a user-pasted
    // bunker:// URL points at — listing fixed origins would break the
    // moment a signer app advertises a new relay. https: covers outbound
    // requests to external APIs (e.g. nostr.band metadata lookups).
    // 'self' stays for our own /api/*.
    "connect-src 'self' wss: https:",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");
}
