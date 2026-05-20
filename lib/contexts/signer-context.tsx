"use client";

/**
 * SignerProvider — combined session + in-memory Nostr signer state.
 *
 * Cursats's buyer flow only signs once at login; after that, the
 * session cookie carries the user. The settings surface adds a
 * second surface that needs post-login signing — payment-
 * destination edits (CBU, alias) require a NIP-07 re-sign per ADR
 * 0008. The `signWithPrompt` + `requestReSignIn` machinery (ported
 * from `bitbybit-arena/lib/signer-context.tsx`) services that flow.
 *
 * Owns:
 *   - session fetch (`/api/auth/session`)
 *   - the in-memory signer for the current page session
 *   - the NIP-98 login round-trip
 *   - sign-out (clears cookie + signer)
 *   - re-attach prompt for nsec/NIP-46 users who reloaded
 *   - signWithPrompt for ad-hoc post-login signing actions
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import { type SignerHandle, makeExtensionSigner } from "@/lib/nostr/signers";
import type { NostrEvent, UnsignedNostrEvent } from "@/lib/nostr/types";
import type { SignerType, Locale } from "@/lib/schemas/auth";

export interface SessionUserSummary {
  id: string;
  slug: string;
  display_name: string;
}

export interface SessionUser {
  pubkey: string;
  locale: Locale;
  signer_type: SignerType | null;
  /**
   * The user row keyed to this pubkey, or null when the user has
   * not claimed a slug yet (or has been deactivated). The panel
   * layout redirects null users to /sign-in; client-side consumers
   * gate the "manage your store" CTA.
   */
  user: SessionUserSummary | null;
  /** Whether this pubkey is in PLATFORM_ADMIN_PUBKEYS. */
  platform_admin: boolean;
}

/**
 * Outcome of `completeLoginWithSigner`. The discriminator lets
 * callers tell a 429 apart from a real auth failure and a
 * cancellation apart from an actual error.
 *
 *  - `network`      — `fetch` itself rejected (offline, CORS, DNS).
 *  - `rate_limited` — server returned 429.
 *  - `api`          — server returned a non-OK status. `code` is
 *                     whatever the server emitted (e.g.
 *                     `auth_invalid_signature`, `auth_clock_skew`).
 *  - `signer`       — the signer threw before we even hit the API
 *                     (user cancelled, extension declined). `cause`
 *                     carries the original error so the caller can
 *                     decide whether to swallow it
 *                     (`isSignerCancellation`) or surface it.
 */
export type LoginResult =
  | { ok: true }
  | { ok: false; reason: "network" }
  | { ok: false; reason: "rate_limited" }
  | { ok: false; reason: "api"; code?: string }
  | { ok: false; reason: "signer"; cause: unknown };

interface SignerContextValue {
  session: SessionUser | null;
  /** True until the initial session fetch resolves. */
  sessionLoading: boolean;
  signer: SignerHandle | null;
  setSigner: (signer: SignerHandle) => void;
  completeLoginWithSigner: (
    signer: SignerHandle,
    locale: Locale
  ) => Promise<LoginResult>;
  signOut: () => Promise<void>;
  /** Re-fetch the session from /api/auth/session. */
  refresh: () => Promise<void>;
  /**
   * Open the re-sign modal and resolve with the new signer once the
   * user re-attaches. Rejects if the modal is closed without a
   * signer, or if no `renderReSignInModal` was passed to the
   * provider (e.g. the buyer-only mount).
   */
  requestReSignIn: () => Promise<SignerHandle>;
  /**
   * Sign and return an event using whatever signer is currently in
   * memory. If no signer is available, opens the re-sign modal first
   * via `requestReSignIn`.
   */
  signWithPrompt: (event: UnsignedNostrEvent) => Promise<NostrEvent>;
}

const SignerContext = createContext<SignerContextValue | null>(null);

export function useSignerContext(): SignerContextValue {
  const ctx = useContext(SignerContext);
  if (!ctx) {
    throw new Error("useSignerContext must be used within SignerProvider");
  }
  return ctx;
}

interface PendingPrompt {
  resolve: (signer: SignerHandle) => void;
  reject: (err: Error) => void;
}

interface SignerProviderProps {
  children: ReactNode;
  /**
   * Initial session value read server-side from the cookie. Lets the
   * navbar render the correct logged-in/logged-out state on first
   * paint instead of flashing the anonymous state until the on-mount
   * `/api/auth/session` fetch resolves. Pass `null` when the cookie
   * is missing/invalid; omit (or pass `undefined`) only when the
   * caller deliberately wants client-only hydration.
   */
  initialSession?: SessionUser | null;
  /**
   * Optional render-prop for the re-attach modal. Buyer-only mounts
   * can skip it; surfaces that need post-login signing must pass
   * one (see `SignerProviderClient`). When omitted,
   * `requestReSignIn` rejects immediately with `no_modal_provider`.
   */
  renderReSignInModal?: (props: {
    open: boolean;
    onSigner: (signer: SignerHandle) => void;
    onCancel: () => void;
  }) => ReactNode;
}

export function SignerProvider({
  children,
  initialSession,
  renderReSignInModal,
}: SignerProviderProps) {
  const [session, setSession] = useState<SessionUser | null>(
    initialSession ?? null
  );
  const [sessionLoading, setSessionLoading] = useState(
    initialSession === undefined
  );
  const [signer, setSignerState] = useState<SignerHandle | null>(null);
  // Mirror of `signer` state. signWithPrompt reads from this ref so a
  // handler that called `requestReSignIn()` and THEN falls through to
  // `signWithPrompt` can see the freshly-attached signer instead of a
  // closed-over null.
  const signerRef = useRef<SignerHandle | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const pendingPromptRef = useRef<PendingPrompt | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/session", { cache: "no-store" });
      if (!res.ok) {
        setSession(null);
        return;
      }
      const data = (await res.json()) as { session: SessionUser | null };
      setSession(data.session);
    } catch {
      setSession(null);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await refresh();
      if (!cancelled) setSessionLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  const setSigner = useCallback((next: SignerHandle) => {
    signerRef.current = next;
    setSignerState((prev) => {
      if (prev && prev !== next) prev.close?.();
      return next;
    });
  }, []);

  // Auto-restore extension signer when the session is valid and
  // window.nostr is present. The extension is the only signer that
  // survives reloads — the key lives in the extension itself, not
  // in our app memory.
  useEffect(() => {
    if (!session || signer) return;
    if (session.signer_type !== "extension") return;

    let cancelled = false;
    const tryAttach = async () => {
      if (typeof window === "undefined" || !window.nostr) return;
      try {
        const pk = await window.nostr.getPublicKey();
        if (cancelled) return;
        if (pk === session.pubkey) {
          setSigner(makeExtensionSigner(pk));
        }
      } catch {
        // Extension declined or unavailable — leave signer null.
      }
    };

    void tryAttach();
    // Extensions can inject window.nostr asynchronously after page
    // load; retry once after a short delay.
    const timer = setTimeout(() => void tryAttach(), 600);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [session, signer, setSigner]);

  const completeLoginWithSigner = useCallback(
    async (next: SignerHandle, locale: Locale): Promise<LoginResult> => {
      // NIP-98 HTTP Auth: build a kind:27235 event whose `u` tag
      // pins the absolute request URL, `method` tag pins the verb,
      // and the custom `cursats_signer` + `cursats_locale` tags travel
      // inside the signed envelope (a MITM cannot forge different
      // values without invalidating the signature). Empty content
      // per the spec.
      const url = new URL("/api/auth/nostr", window.location.origin).toString();

      let signed;
      try {
        signed = await next.sign({
          kind: 27235,
          created_at: Math.floor(Date.now() / 1000),
          tags: [
            ["u", url],
            ["method", "POST"],
            ["cursats_signer", next.type],
            ["cursats_locale", locale],
          ],
          content: "",
        });
      } catch (cause) {
        return { ok: false, reason: "signer", cause };
      }

      let authRes: Response;
      try {
        authRes = await fetch("/api/auth/nostr", {
          method: "POST",
          headers: {
            Authorization: `Nostr ${btoa(JSON.stringify(signed))}`,
          },
        });
      } catch {
        return { ok: false, reason: "network" };
      }

      if (authRes.status === 429) {
        return { ok: false, reason: "rate_limited" };
      }
      if (!authRes.ok) {
        const json = (await authRes.json().catch(() => null)) as {
          error?: string;
        } | null;
        return { ok: false, reason: "api", code: json?.error };
      }

      setSigner(next);
      await refresh();
      return { ok: true };
    },
    [setSigner, refresh]
  );

  const signOut = useCallback(async () => {
    try {
      await fetch("/api/auth/signout", { method: "POST" });
    } catch {
      // Best-effort — clear local state regardless.
    }
    signerRef.current = null;
    setSignerState((prev) => {
      prev?.close?.();
      return null;
    });
    setSession(null);
  }, []);

  const requestReSignIn = useCallback((): Promise<SignerHandle> => {
    return new Promise<SignerHandle>((resolve, reject) => {
      if (!renderReSignInModal) {
        reject(new Error("no_modal_provider"));
        return;
      }
      // Reject any prior pending call so callers don't leak. The
      // single modal can only service one prompt at a time.
      pendingPromptRef.current?.reject(new Error("re_sign_in_superseded"));
      pendingPromptRef.current = { resolve, reject };
      setModalOpen(true);
    });
  }, [renderReSignInModal]);

  const handleModalSigner = useCallback((next: SignerHandle) => {
    // The modal has already run the reattach check and called
    // setSigner. Resolve the pending promise and close.
    const pending = pendingPromptRef.current;
    pendingPromptRef.current = null;
    setModalOpen(false);
    pending?.resolve(next);
  }, []);

  const handleModalCancel = useCallback(() => {
    const pending = pendingPromptRef.current;
    pendingPromptRef.current = null;
    setModalOpen(false);
    pending?.reject(new Error("re_sign_in_cancelled"));
  }, []);

  const signWithPrompt = useCallback(
    async (event: UnsignedNostrEvent): Promise<NostrEvent> => {
      let active = signerRef.current;
      if (!active) {
        active = await requestReSignIn();
      }
      return active.sign(event);
    },
    [requestReSignIn]
  );

  const value = useMemo<SignerContextValue>(
    () => ({
      session,
      sessionLoading,
      signer,
      setSigner,
      completeLoginWithSigner,
      signOut,
      refresh,
      requestReSignIn,
      signWithPrompt,
    }),
    [
      session,
      sessionLoading,
      signer,
      setSigner,
      completeLoginWithSigner,
      signOut,
      refresh,
      requestReSignIn,
      signWithPrompt,
    ]
  );

  return (
    <SignerContext.Provider value={value}>
      {children}
      {renderReSignInModal?.({
        open: modalOpen,
        onSigner: handleModalSigner,
        onCancel: handleModalCancel,
      })}
    </SignerContext.Provider>
  );
}
