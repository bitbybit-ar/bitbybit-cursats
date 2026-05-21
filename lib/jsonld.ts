// U+2028 (LINE SEPARATOR) and U+2029 (PARAGRAPH SEPARATOR). Built from
// char codes so the source stays ASCII — a literal in a regex literal
// would terminate the line before the closing slash and break parsing.
const LS = String.fromCharCode(0x2028);
const PS = String.fromCharCode(0x2029);

/**
 * Serialize a JSON-LD payload safely for inline `<script>` embedding.
 *
 * JSON.stringify will happily emit four sequences that break out of
 * an inline script tag the moment any value (current or future) is
 * attacker-controlled:
 *
 *   - `</script` closes the surrounding script element.
 *   - `<!--` opens an HTML comment, which can be paired with a
 *     trailing `-->` to swallow following markup.
 *   - U+2028 (LINE SEPARATOR) and U+2029 (PARAGRAPH SEPARATOR) are
 *     valid in JSON strings but parse as real newlines in the
 *     surrounding JavaScript, splitting the string literal in two.
 *
 * Today every input is server-side config + i18n strings, so none of
 * these can be triggered in practice. Escape pre-emptively so the
 * surface stays safe when a future contributor passes a user's
 * `display_name` (or any other user-controlled value) into a
 * schema.org blob.
 */
export function serializeJsonLd(value: unknown): string {
  return JSON.stringify(value)
    .replace(/<\/script/gi, "<\\/script")
    .replace(/<!--/g, "<\\!--")
    .split(LS).join("\\u2028")
    .split(PS).join("\\u2029");
}
