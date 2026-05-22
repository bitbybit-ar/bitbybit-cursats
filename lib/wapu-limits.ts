/**
 * Wapu rail limits that the UI and API both enforce.
 *
 * Kept in its own tiny, dependency-free module so a client component
 * (the create-course form) and a server route (/api/my-courses) can
 * share the value without dragging the Wapu client into a client
 * bundle.
 */

/**
 * Wapu rejects fiat withdrawals below this ARS amount (observed live:
 * `400 {"error":"Minimum amount is $10000 ARS"}`). On the wapu_ars rail
 * the seller absorbs the fee, so the withdrawal pays the *net*
 * (price − fee). The create-course form floors a course's net payout at
 * this value so a sale can actually be paid out. ADR 0026.
 */
export const WAPU_MIN_NET_ARS = 10_000;
