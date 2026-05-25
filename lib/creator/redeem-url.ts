/**
 * Validation for an offering's redeem/contact link (`redeem_url`).
 *
 * Code-type offerings carry a link where the buyer presents their
 * redemption code — a web page, a WhatsApp/Telegram link
 * (`https://wa.me/…`, `https://t.me/…`), an email (`mailto:…`), or a
 * phone (`tel:…`). We accept those four protocols and nothing else:
 * `http:` is a downgrade vector and `javascript:`/`data:` are XSS
 * vectors when the receipt renders the link.
 *
 * This module is intentionally pure (no server imports) so the same
 * rule backs both the Zod API schema in `lib/creator/offerings.ts`
 * and the client-side inline check in the create-course form. Issue
 * #60.
 */

export const REDEEM_URL_PROTOCOLS = ["https:", "mailto:", "tel:"] as const;

/** True when `value` is a URL using one of the accepted protocols. */
export function isValidRedeemUrl(value: string): boolean {
  try {
    const protocol = new URL(value.trim()).protocol;
    return (REDEEM_URL_PROTOCOLS as readonly string[]).includes(protocol);
  } catch {
    return false;
  }
}
