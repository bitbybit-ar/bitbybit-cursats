"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { QRCodeSVG } from "qrcode.react";
import type { BunkerSigner } from "nostr-tools/nip46";
import {
  NIP46_TIMEOUT_MS,
  createConnectSession,
  waitForConnection,
  connectWithBunkerURL,
} from "@/lib/nostr/nip46-login";
import { type SignerHandle, makeNip46Signer } from "@/lib/nostr/signers";
import {
  type AuthError,
  loginError,
  reSignInError,
} from "@/lib/nostr/auth-errors";
import { Button } from "@/components/ui/button";
import { CheckIcon, CopyIcon, LinkIcon } from "@/components/icons";
import styles from "./nostr-connect-panel.module.scss";

type Mode = "qr" | "bunker";

interface NostrConnectPanelProps {
  /**
   * Which flow this panel renders.
   * - `"qr"`     → generates a nostrconnect:// URI, shows QR + URI
   *                field, waits for the signer to approve.
   * - `"bunker"` → shows a bunker:// URL input + Connect button.
   */
  mode: Mode;
  onSigner: (signer: SignerHandle) => void | Promise<void>;
  onError?: (error: AuthError) => void;
  /** When provided, rejects signers whose pubkey doesn't match. */
  expectedPubkey?: string;
}

type ConnectStatus = "scanning" | "connecting" | "expired";

const SLOW_HINT_MS = 10_000;

/**
 * Reject auth URLs that aren't http(s) before rendering them as a
 * link. A malicious bunker could otherwise return `javascript:`
 * and hijack the click.
 */
function safeAuthUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return parsed.toString();
    }
  } catch {
    // Not a valid URL; fall through.
  }
  return null;
}

function formatMmSs(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * NIP-46 Nostr Connect flow.
 *
 * Renders one of two sub-flows based on `mode`. They share the
 * `finalize` logic (close on mismatch, emit signer on success) but
 * the QR mode runs the connect session lifecycle on mount and the
 * bunker mode is purely form-driven, so the bunker mode does not
 * spin up a relay session it would never use.
 */
export function NostrConnectPanel({
  mode,
  onSigner,
  onError,
  expectedPubkey,
}: NostrConnectPanelProps) {
  const t = useTranslations("login");
  const [status, setStatus] = useState<ConnectStatus>(
    mode === "qr" ? "scanning" : "scanning"
  );
  const [uri, setUri] = useState("");
  const [bunkerUrl, setBunkerUrl] = useState("");
  const [isCopied, setIsCopied] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [authChallengeUrl, setAuthChallengeUrl] = useState<string | null>(null);
  const [showSlowHint, setShowSlowHint] = useState(false);
  const [remainingMs, setRemainingMs] = useState(NIP46_TIMEOUT_MS);

  // Refs hold the latest callbacks/expected pubkey so the
  // mount-once effect below doesn't need them in its dep list.
  // Without this, any parent re-render that passes a fresh arrow
  // (signin-client.tsx does) would restart the scan, abort the
  // in-flight BunkerSigner, and invalidate whatever QR the user
  // had just scanned.
  const onSignerRef = useRef(onSigner);
  const onErrorRef = useRef(onError);
  const expectedPubkeyRef = useRef(expectedPubkey);
  useEffect(() => {
    onSignerRef.current = onSigner;
    onErrorRef.current = onError;
    expectedPubkeyRef.current = expectedPubkey;
  }, [onSigner, onError, expectedPubkey]);

  const abortRef = useRef<AbortController | null>(null);
  const slowHintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearSlowHint = useCallback(() => {
    if (slowHintTimerRef.current) {
      clearTimeout(slowHintTimerRef.current);
      slowHintTimerRef.current = null;
    }
    setShowSlowHint(false);
  }, []);

  const clearCountdown = useCallback(() => {
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
  }, []);

  const finalize = useCallback(async (bunker: BunkerSigner) => {
    try {
      const pubkey = await bunker.getPublicKey();
      const expected = expectedPubkeyRef.current;
      if (expected && pubkey !== expected) {
        await bunker.close();
        onErrorRef.current?.(reSignInError("mismatch"));
        return;
      }
      await onSignerRef.current(makeNip46Signer(bunker, pubkey));
    } catch {
      try {
        await bunker.close();
      } catch {
        // Ignore — we're tearing down anyway.
      }
      onErrorRef.current?.(loginError("connectError"));
    }
  }, []);

  const startScan = useCallback(() => {
    setLocalError(null);
    setAuthChallengeUrl(null);
    clearSlowHint();
    clearCountdown();
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const session = createConnectSession();
    setUri(session.uri);
    setStatus("scanning");
    setRemainingMs(NIP46_TIMEOUT_MS);

    slowHintTimerRef.current = setTimeout(() => {
      setShowSlowHint(true);
    }, SLOW_HINT_MS);

    const startedAt = Date.now();
    countdownRef.current = setInterval(() => {
      const elapsed = Date.now() - startedAt;
      const left = NIP46_TIMEOUT_MS - elapsed;
      setRemainingMs(left > 0 ? left : 0);
      if (left <= 0) clearCountdown();
    }, 1000);

    waitForConnection(session, {
      abortSignal: controller.signal,
      onAuthUrl: (url) => setAuthChallengeUrl(safeAuthUrl(url)),
    })
      .then(async (bunker) => {
        clearSlowHint();
        clearCountdown();
        setStatus("connecting");
        await finalize(bunker);
      })
      .catch((err) => {
        clearSlowHint();
        clearCountdown();
        // Log the underlying error so we can tell the difference
        // between a clean 60s timeout and a relay/parse failure
        // that surfaces seconds after mount. Without this the
        // panel just renders "expired" with no diagnostic trail.
        if (!controller.signal.aborted) {
          // eslint-disable-next-line no-console
          console.error("[nip46] waitForConnection failed:", err);
          setStatus("expired");
        }
      });
  }, [finalize, clearSlowHint, clearCountdown]);

  // Mount-once effect: in QR mode, start the scan when the panel
  // opens and abort whatever is in flight on unmount. In bunker
  // mode there is no scan to start — the form drives the flow on
  // submit. Mode is captured at mount via a ref so the effect deps
  // can stay empty; without that, HMR or any prop-identity blip
  // could re-fire the effect, abort the in-flight BunkerSigner,
  // and invalidate the QR the user has already scanned.
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const startScanRef = useRef(startScan);
  useEffect(() => {
    startScanRef.current = startScan;
  }, [startScan]);
  useEffect(() => {
    if (modeRef.current !== "qr") return;
    startScanRef.current();
    return () => {
      abortRef.current?.abort();
      if (slowHintTimerRef.current) {
        clearTimeout(slowHintTimerRef.current);
      }
      if (countdownRef.current) {
        clearInterval(countdownRef.current);
      }
    };
  }, []);

  // Cheap shape check before we tear down the QR session and burn
  // the round-trip to the bunker. Catches the typo case AND
  // validates the host portion is a 64-char hex pubkey or an npub1
  // — the only two shapes the NIP-46 spec allows after `bunker://`.
  // Anything looser would let a half-valid URL slip past us and
  // surface the deeper "Connection failed" message a few seconds
  // later, which read as a different error to users even though
  // it's the same root cause.
  const BUNKER_HOST_RE = /^(?:[0-9a-f]{64}|npub1[ac-hj-np-z02-9]{58,})/i;
  const looksLikeBunkerUrl = (raw: string): boolean => {
    const trimmed = raw.trim();
    if (!trimmed.startsWith("bunker://")) return false;
    const remainder = trimmed.slice("bunker://".length);
    return BUNKER_HOST_RE.test(remainder);
  };

  const handleBunkerConnect = async () => {
    const trimmed = bunkerUrl.trim();
    if (!trimmed) return;
    if (!looksLikeBunkerUrl(trimmed)) {
      setLocalError(t("connectInvalidBunker"));
      return;
    }
    setStatus("connecting");
    setLocalError(null);
    try {
      const bunker = await connectWithBunkerURL(trimmed, {
        onAuthUrl: (url) => setAuthChallengeUrl(safeAuthUrl(url)),
      });
      await finalize(bunker);
    } catch {
      setStatus("scanning");
      setLocalError(t("connectError"));
    }
  };

  const handleCopyURI = async () => {
    try {
      await navigator.clipboard.writeText(uri);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch {
      // Insecure context — the QR is the fallback.
    }
  };

  if (status === "connecting") {
    return (
      <div className={styles.connectingState}>
        <span className={styles.spinner} aria-hidden />
        <p className={styles.waiting}>{t("connectConnecting")}</p>
      </div>
    );
  }

  if (mode === "qr" && status === "expired") {
    return (
      <div className={styles.expired}>
        <p>{t("connectExpired")}</p>
        <Button type="button" variant="primary" size="sm" onClick={startScan}>
          {t("connectRetry")}
        </Button>
      </div>
    );
  }

  if (mode === "bunker") {
    return (
      <>
        <p className={styles.intro}>{t("connectBunkerModalIntro")}</p>

        <label htmlFor="bunker-input" className={styles.bunkerLabel}>
          {t("connectBunkerLabel")}
        </label>
        <div className={styles.bunkerInputRow}>
          <input
            id="bunker-input"
            type="text"
            className={styles.bunkerInput}
            placeholder={t("connectBunkerPlaceholder")}
            value={bunkerUrl}
            onChange={(e) => setBunkerUrl(e.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={handleBunkerConnect}
            disabled={!bunkerUrl.trim()}
          >
            {t("connectBunkerSubmit")}
          </Button>
        </div>

        {localError ? (
          <p className={styles.errorInModal}>{localError}</p>
        ) : null}

        <p className={styles.compatible}>{t("connectCompatible")}</p>
      </>
    );
  }

  return (
    <>
      {authChallengeUrl ? (
        <a
          href={authChallengeUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={styles.approveBanner}
          onClick={() => setAuthChallengeUrl(null)}
        >
          <LinkIcon size={16} />
          {t("connectApproveInSigner")}
        </a>
      ) : null}

      <p className={styles.intro}>{t("connectScanModalIntro")}</p>

      <div
        className={styles.qrWrapper}
        role="img"
        aria-label={t("connectQrAlt")}
      >
        <QRCodeSVG
          value={uri}
          size={200}
          level="M"
          bgColor="transparent"
          fgColor="currentColor"
        />
      </div>

      <div className={styles.statusRow}>
        <span className={styles.statusDot} aria-hidden />
        <span className={styles.statusLabel}>
          {t("connectWaitingForSigner")}
        </span>
        <span className={styles.statusTimer}>
          {t("connectExpiresIn", { time: formatMmSs(remainingMs) })}
        </span>
      </div>

      <div className={styles.uriField}>
        <input
          type="text"
          readOnly
          value={uri}
          className={styles.uriInput}
          aria-label={t("connectCopyURI")}
          onFocus={(e) => e.currentTarget.select()}
        />
        <button
          type="button"
          className={styles.uriCopyBtn}
          onClick={handleCopyURI}
          aria-label={isCopied ? t("connectCopiedURI") : t("connectCopyURI")}
        >
          {isCopied ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
        </button>
      </div>

      {showSlowHint ? (
        <p className={styles.slowHint}>{t("connectSlowHint")}</p>
      ) : null}
    </>
  );
}

export default NostrConnectPanel;
