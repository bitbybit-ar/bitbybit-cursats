"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { Link, useRouter } from "@/i18n/routing";
import { Container } from "@/components/ui/container";
import { Card } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import {
  ArrowLeftIcon,
  BoltIcon,
  CheckIcon,
  CopyIcon,
  FlagIcon,
} from "@/components/icons";
import { SignerMethodButtons } from "@/components/auth/signer-method-buttons";
import { NsecSignerForm } from "@/components/auth/nsec-signer-form";
import { NostrConnectPanel } from "@/components/auth/nostr-connect-panel";
import {
  useSignerContext,
  type LoginResult,
} from "@/lib/contexts/signer-context";
import { useAuthErrorLookup } from "@/lib/hooks/useAuthErrorLookup";
import { useIsMobile } from "@/lib/hooks/useIsMobile";
import {
  type AuthError,
  loginError,
  isSignerCancellation,
} from "@/lib/nostr/auth-errors";
import { createNewIdentity } from "@/lib/nostr/create-account";
import { makeNsecSigner, type SignerHandle } from "@/lib/nostr/signers";
import type { Locale } from "@/lib/schemas/auth";
import styles from "./signin.module.scss";

type Panel = "picker" | "nsec" | "nip46-qr" | "nip46-bunker";

// Discriminated state machine for the create-identity flow:
//
//  - `idle`        — no identity generation in flight; modal closed.
//  - `auth_failed` — nsec is on screen but the auth round-trip
//                    failed; carries the signer for retry + the
//                    localised error to render. Continue stays
//                    disabled until we leave this state.
//  - `ready`       — auth succeeded; modal stays open so the user
//                    can copy the nsec and click Continue.
//
// Encoding it as a tagged union makes it impossible to forget the
// signer-clearing step on success — the success transition is
// `auth_failed` → `ready` which simply swaps to a variant without
// a `signer` field, so any code that tried to reuse it post-
// success would fail to type-check.
type CreateState =
  | { kind: "idle" }
  | {
      kind: "auth_failed";
      nsec: string;
      signer: SignerHandle;
      error: string | null;
    }
  | { kind: "ready"; nsec: string };

const ALLOWED_NEXT_PREFIXES = [
  "/purchases",
  "/my-courses",
  "/create-course",
  "/orders",
  "/settings",
  "/claim/",
  "/receipt/",
];

function safeNext(raw: string | null): string {
  if (!raw) return "/purchases";
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("..")) {
    return "/purchases";
  }
  if (ALLOWED_NEXT_PREFIXES.some((p) => raw.startsWith(p))) return raw;
  return "/purchases";
}

interface SignInClientProps {
  locale: Locale;
}

export function SignInClient({ locale }: SignInClientProps) {
  const t = useTranslations("login");
  const tErr = useTranslations("errors");
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = safeNext(searchParams.get("next"));
  const lookupAuthError = useAuthErrorLookup();
  const isMobile = useIsMobile();
  const { completeLoginWithSigner } = useSignerContext();

  const [panel, setPanel] = useState<Panel>("picker");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [isCreating, setIsCreating] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [isAcknowledged, setIsAcknowledged] = useState(false);
  const [createState, setCreateState] = useState<CreateState>({
    kind: "idle",
  });
  const createdNsec = createState.kind === "idle" ? null : createState.nsec;
  const isAuthFailed = createState.kind === "auth_failed";

  const messageFor = (
    result: Extract<LoginResult, { ok: false }>
  ): string | null => {
    if (result.reason === "signer") {
      if (isSignerCancellation(result.cause)) return null;
      return lookupAuthError(loginError("nostr_signing_rejected"));
    }
    if (result.reason === "rate_limited") {
      return lookupAuthError(loginError("rate_limited"));
    }
    if (result.reason === "network") {
      return tErr("network");
    }
    return lookupAuthError(loginError("error"));
  };

  const handleSigner = async (signer: SignerHandle) => {
    setErrorMessage(null);
    const result = await completeLoginWithSigner(signer, locale);
    if (!result.ok) {
      const msg = messageFor(result);
      if (msg) setErrorMessage(msg);
      return;
    }
    router.push(nextPath);
  };

  const handleError = (err: AuthError) => {
    setErrorMessage(lookupAuthError(err));
  };

  const closePanel = () => {
    setPanel("picker");
    setErrorMessage(null);
  };

  const handleCreateIdentity = async () => {
    setErrorMessage(null);
    setIsCreating(true);
    try {
      const { secretKey, pubkey, nsec } = createNewIdentity();
      const signer = makeNsecSigner(secretKey, pubkey);
      // Enter `auth_failed` BEFORE awaiting the round-trip — this
      // pins the freshly-generated nsec on screen immediately so a
      // network blip mid-call never strips the user of the only
      // copy of their key. Same posture as the arena reference.
      setCreateState({ kind: "auth_failed", nsec, signer, error: null });
      const result = await completeLoginWithSigner(signer, locale);
      if (!result.ok) {
        const msg = messageFor(result);
        setCreateState({
          kind: "auth_failed",
          nsec,
          signer,
          error: msg ?? null,
        });
        return;
      }
      // Success — swap to `ready`. The signer field drops off the
      // variant so any code that tried to reuse it would not
      // type-check.
      setCreateState({ kind: "ready", nsec });
    } catch {
      setErrorMessage(t("error"));
      setCreateState({ kind: "idle" });
    } finally {
      setIsCreating(false);
    }
  };

  // Retry the auth round-trip with the SAME signer we already
  // generated. Crucial: do NOT call createNewIdentity again — that
  // would burn the user's first nsec and hand them a fresh one
  // they have not memorised.
  const handleRetryCreateAuth = async () => {
    if (createState.kind !== "auth_failed") return;
    const { nsec, signer } = createState;
    setCreateState({ kind: "auth_failed", nsec, signer, error: null });
    setIsCreating(true);
    try {
      const result = await completeLoginWithSigner(signer, locale);
      if (!result.ok) {
        const msg = messageFor(result);
        setCreateState({
          kind: "auth_failed",
          nsec,
          signer,
          error: msg ?? null,
        });
        return;
      }
      setCreateState({ kind: "ready", nsec });
    } catch {
      setCreateState({
        kind: "auth_failed",
        nsec,
        signer,
        error: t("error"),
      });
    } finally {
      setIsCreating(false);
    }
  };

  const handleCopyNsec = async () => {
    if (!createdNsec) return;
    try {
      await navigator.clipboard.writeText(createdNsec);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch {
      // Clipboard unavailable — the visible code box is the
      // fallback; nothing else to do.
    }
  };

  const handleContinueAfterCreate = () => {
    setCreateState({ kind: "idle" });
    setIsAcknowledged(false);
    router.push(nextPath);
  };

  return (
    <Container center>
      <Card variant="default" className={styles.card}>
        <h1 className={styles.title}>{t("title")}</h1>
        <p className={styles.subtitle}>{t("subtitle")}</p>

        <SignerMethodButtons
          onSigner={handleSigner}
          onError={handleError}
          onSelectNip46Qr={() => setPanel("nip46-qr")}
          onSelectNip46Bunker={() => setPanel("nip46-bunker")}
          onSelectNsec={() => setPanel("nsec")}
          animate
        />

        <div className={styles.divider}>
          <span>{t("orNew")}</span>
        </div>

        <Button
          type="button"
          variant="secondary"
          fullWidth
          onClick={handleCreateIdentity}
          disabled={isCreating}
          className={styles.createButton}
        >
          <BoltIcon size={20} />
          <div className={styles.createInfo}>
            <span className={styles.createName}>
              {isCreating ? t("creatingIdentity") : t("createIdentity")}
            </span>
            <span className={styles.createDescription}>
              {t("createIdentityDescription")}
            </span>
          </div>
        </Button>

        {errorMessage && panel === "picker" ? (
          <p className={styles.error} role="alert">
            {errorMessage}
          </p>
        ) : null}

        {/* The WoT browser extension can't be installed on phones,
            so the hint only makes sense on desktop. */}
        {!isMobile ? (
          <p className={styles.wotHint}>
            {t("wotHint")}{" "}
            <a
              href="https://nostr-wot.com/download"
              target="_blank"
              rel="noopener noreferrer"
              className={styles.wotLink}
            >
              {t("wotExtensionLabel")}
            </a>
            ?
          </p>
        ) : null}
      </Card>

      <div className={styles.backLinkWrapper}>
        <Link href="/" className={styles.backLink}>
          <ArrowLeftIcon size={16} />
          {t("backToHome")}
        </Link>
      </div>

      {panel === "nsec" ? (
        <Modal onClose={closePanel} title={t("nsecTitle")} size="sm">
          <NsecSignerForm
            onSigner={handleSigner}
            onError={handleError}
            showWarning
            requireAcceptRisk
            submitLabel={t("nsecSignIn")}
            submittingLabel={t("nsecSigningIn")}
          />
          {errorMessage ? (
            <p className={styles.error} role="alert">
              {errorMessage}
            </p>
          ) : null}
        </Modal>
      ) : null}

      {panel === "nip46-qr" ? (
        <Modal
          onClose={closePanel}
          onBack={closePanel}
          title={
            isMobile ? t("connectAppModalTitle") : t("connectScanModalTitle")
          }
          size="sm"
        >
          <NostrConnectPanel
            mode="qr"
            onSigner={handleSigner}
            onError={handleError}
          />
          {errorMessage ? (
            <p className={styles.error} role="alert">
              {errorMessage}
            </p>
          ) : null}
        </Modal>
      ) : null}

      {panel === "nip46-bunker" ? (
        <Modal
          onClose={closePanel}
          onBack={closePanel}
          title={t("connectBunkerModalTitle")}
          size="sm"
        >
          <NostrConnectPanel
            mode="bunker"
            onSigner={handleSigner}
            onError={handleError}
          />
          {errorMessage ? (
            <p className={styles.error} role="alert">
              {errorMessage}
            </p>
          ) : null}
        </Modal>
      ) : null}

      {createdNsec ? (
        <Modal
          onClose={handleContinueAfterCreate}
          title={t("createdTitle")}
          size="sm"
        >
          <div className={styles.createdSuccess}>
            <CheckIcon size={32} />
          </div>
          <p className={styles.createdIntro}>{t("createdIntro")}</p>

          <label className={styles.createdLabel}>{t("createdNsecLabel")}</label>
          <div className={styles.createdNsecBox}>
            <code className={styles.createdNsec}>{createdNsec}</code>
            <button
              type="button"
              className={styles.createdCopyBtn}
              onClick={handleCopyNsec}
              aria-label={t("createdCopy")}
            >
              {isCopied ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
              {isCopied ? t("createdCopied") : t("createdCopy")}
            </button>
          </div>

          <div className={styles.createdWarning}>
            <FlagIcon size={16} />
            <span>{t("createdWarning")}</span>
          </div>

          {/*
              Auth-failed branch: the nsec is on screen so the user
              can save it, but we couldn't establish a session.
              Render the localised failure + a Retry button that
              re-uses the already-generated signer (NEVER spawns a
              new identity — that would orphan the key the user is
              reading right now).
            */}
          {createState.kind === "auth_failed" ? (
            <div className={styles.createdAuthError}>
              {createState.error ? (
                <p className={styles.error} role="alert">
                  {createState.error}
                </p>
              ) : null}
              <Button
                type="button"
                variant="primary"
                fullWidth
                onClick={handleRetryCreateAuth}
                disabled={isCreating}
              >
                {isCreating ? t("creatingIdentity") : t("createdRetryAuth")}
              </Button>
            </div>
          ) : null}

          <label className={styles.createdAck}>
            <input
              type="checkbox"
              checked={isAcknowledged}
              onChange={(e) => setIsAcknowledged(e.target.checked)}
            />
            <span>{t("createdAckLabel")}</span>
          </label>

          <Button
            type="button"
            variant="primary"
            fullWidth
            onClick={handleContinueAfterCreate}
            // Continue is only meaningful in the `ready` variant.
            // Disabling it whenever auth has not succeeded prevents
            // a click from pushing the user into the app with an
            // unauthenticated session.
            disabled={!isAcknowledged || isAuthFailed}
          >
            {t("createdContinue")}
          </Button>
        </Modal>
      ) : null}
    </Container>
  );
}
