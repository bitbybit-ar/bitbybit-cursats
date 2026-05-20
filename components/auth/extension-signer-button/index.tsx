"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { BoltIcon } from "@/components/icons";
import { type SignerHandle, makeExtensionSigner } from "@/lib/nostr/signers";
import {
  type AuthError,
  loginError,
  reSignInError,
} from "@/lib/nostr/auth-errors";
import { cn } from "@/lib/utils";
import styles from "./extension-signer-button.module.scss";

interface ExtensionSignerButtonProps {
  /** Called with a ready-to-use signer once the user grants access. */
  onSigner: (signer: SignerHandle) => void | Promise<void>;
  /** Called with a structured error on failure. */
  onError?: (error: AuthError) => void;
  /**
   * When provided, the produced signer's pubkey must match this
   * value. Reserved for the re-attach flow.
   */
  expectedPubkey?: string;
  /** Hide the button entirely when no NIP-07 extension is detected. */
  hideIfUnavailable?: boolean;
  className?: string;
}

/**
 * NIP-07 "Sign in with browser extension" button. Produces a
 * `SignerHandle`; the parent decides what to do with it (login flow
 * passes it to `completeLoginWithSigner`).
 */
export function ExtensionSignerButton({
  onSigner,
  onError,
  expectedPubkey,
  hideIfUnavailable = false,
  className,
}: ExtensionSignerButtonProps) {
  const t = useTranslations("login");
  const [hasExtension, setHasExtension] = useState(false);
  const [isChecking, setIsChecking] = useState(true);
  const [isBusy, setIsBusy] = useState(false);

  useEffect(() => {
    const check = () =>
      setHasExtension(typeof window !== "undefined" && !!window.nostr);
    check();
    const timer = setTimeout(() => {
      check();
      setIsChecking(false);
    }, 500);
    return () => clearTimeout(timer);
  }, []);

  if (!hasExtension && hideIfUnavailable) return null;

  const handleClick = async () => {
    if (!window.nostr) {
      onError?.(loginError("no_extension"));
      return;
    }
    setIsBusy(true);
    try {
      const pubkey = await window.nostr.getPublicKey();
      if (expectedPubkey && pubkey !== expectedPubkey) {
        onError?.(reSignInError("mismatch"));
        return;
      }
      await onSigner(makeExtensionSigner(pubkey));
    } catch (err) {
      const msg = err instanceof Error ? err.message.toLowerCase() : "";
      if (msg.includes("rejected") || msg.includes("denied")) {
        onError?.(loginError("nostr_signing_rejected"));
      } else {
        onError?.(reSignInError("extensionRejected"));
      }
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div className={styles.wrapper}>
      <div className={styles.buttonShell}>
        <Button
          type="button"
          variant="primary"
          fullWidth
          className={cn(styles.extensionButton, className)}
          onClick={handleClick}
          disabled={isBusy || !hasExtension}
          title={!hasExtension && !isChecking ? t("no_extension") : undefined}
        >
          <BoltIcon size={20} />
          <div className={styles.info}>
            <span className={styles.name}>{t("extensionTitle")}</span>
            <span className={styles.description}>
              {t("extensionDescription")}
            </span>
          </div>
        </Button>
        {hasExtension ? (
          <span className={styles.detectedBadge} aria-hidden="true">
            {t("extensionDetected")}
          </span>
        ) : null}
      </div>
      {!isChecking && !hasExtension ? (
        <p className={styles.help}>{t("no_extension")}</p>
      ) : null}
    </div>
  );
}

export default ExtensionSignerButton;
