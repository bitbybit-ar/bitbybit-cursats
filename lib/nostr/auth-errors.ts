/**
 * Structured error emitted by the shared Nostr auth components
 * (ExtensionSignerButton, NsecSignerForm) instead of a bare i18n key
 * string. Carries the namespace so consumers can dispatch to the
 * correct `useTranslations` without try/catch or hand-maintained key
 * sets.
 *
 * Only the `login` namespace is used today; `reSignIn` is reserved
 * for the post-reload re-attach flow that lands when we add signing
 * actions beyond the initial auth round-trip.
 */
export type AuthError =
  | { namespace: "login"; key: LoginErrorKey }
  | { namespace: "reSignIn"; key: ReSignInErrorKey };

/** Keys defined under the `login` namespace in `messages/*.json`. */
export type LoginErrorKey =
  | "no_extension"
  | "nostr_signing_rejected"
  | "nsecInvalidKey"
  | "connectError"
  | "connectInvalidBunker"
  | "rate_limited"
  | "error";

/** Keys defined under the `reSignIn` namespace. Reserved for future use. */
export type ReSignInErrorKey = "extensionRejected" | "mismatch" | "authFailed";

export const loginError = (key: LoginErrorKey): AuthError => ({
  namespace: "login",
  key,
});

export const reSignInError = (key: ReSignInErrorKey): AuthError => ({
  namespace: "reSignIn",
  key,
});

/**
 * Tell whether a signer failure was a deliberate cancellation rather
 * than an unexpected error. Extension vendors don't standardise the
 * wording of the user-rejected error, so this is a best-effort
 * substring match — same heuristic the shared ExtensionSignerButton
 * uses inline.
 */
export function isSignerCancellation(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  return (
    msg.includes("rejected") || msg.includes("denied") || msg.includes("cancel")
  );
}
