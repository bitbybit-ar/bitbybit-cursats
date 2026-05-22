"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { ExtensionSignerButton } from "@/components/auth/extension-signer-button";
import { KeyIcon, LinkIcon, QrIcon } from "@/components/icons";
import { useIsMobile } from "@/lib/hooks/useIsMobile";
import type { SignerHandle, SignerType } from "@/lib/nostr/signers";
import type { AuthError } from "@/lib/nostr/auth-errors";
import styles from "./signer-method-buttons.module.scss";

interface SignerMethodButtonsProps {
  /** Fires when any of the methods produces a ready signer. */
  onSigner: (signer: SignerHandle) => void | Promise<void>;
  /** Fires with a structured error from any of the child flows. */
  onError: (error: AuthError) => void;
  /**
   * When provided, the extension flow enforces that the produced
   * signer's pubkey matches this value (re-attach flow).
   */
  expectedPubkey?: string;
  /** Called when the user picks the NIP-46 Scan QR option. */
  onSelectNip46Qr: () => void;
  /** Called when the user picks the NIP-46 Bunker URL option. */
  onSelectNip46Bunker: () => void;
  /** Called when the user picks the nsec paste option. */
  onSelectNsec: () => void;
  /** Disables the picker buttons while the parent is busy. */
  disabled?: boolean;
  /**
   * Restrict which signer methods are rendered. Defaults to all
   * three (extension + nip46 + nsec). The re-attach flow uses this
   * to hide methods weaker than the user's original signer.
   */
  allowedMethods?: SignerType[];
  /**
   * Play the stagger fade-in when mounted. Useful on first page
   * load (sign-in page). Should stay off inside modals that re-
   * mount the picker on back navigation.
   */
  animate?: boolean;
}

const ALL_METHODS: SignerType[] = ["extension", "nip46", "nsec"];

export function SignerMethodButtons({
  onSigner,
  onError,
  expectedPubkey,
  onSelectNip46Qr,
  onSelectNip46Bunker,
  onSelectNsec,
  disabled,
  allowedMethods = ALL_METHODS,
  animate = false,
}: SignerMethodButtonsProps) {
  const t = useTranslations("login");
  const isMobile = useIsMobile();

  const wrapperClassName = animate
    ? `${styles.methods} ${styles.animate}`
    : styles.methods;

  const allowed = new Set(allowedMethods);
  const showExtension = allowed.has("extension");
  const showNip46 = allowed.has("nip46");
  const showNsec = allowed.has("nsec");

  // Mobile browsers have no NIP-07 extension to call. Hide the
  // extension button there — but only when another method is on
  // offer, so a re-attach flow restricted to `extension` alone never
  // renders an empty picker.
  const hideExtensionOnMobile = isMobile && (showNip46 || showNsec);

  return (
    <div className={wrapperClassName}>
      {showExtension ? (
        <ExtensionSignerButton
          onSigner={onSigner}
          onError={onError}
          expectedPubkey={expectedPubkey}
          hideIfUnavailable={hideExtensionOnMobile}
        />
      ) : null}

      {showNip46 ? (
        <div className={styles.nip46Row}>
          <Button
            type="button"
            variant="primary"
            fullWidth
            className={styles.methodButton}
            onClick={onSelectNip46Qr}
            disabled={disabled}
          >
            <QrIcon size={20} />
            <div className={styles.methodInfo}>
              <span className={styles.methodName}>
                {isMobile ? t("connectAppTitle") : t("connectQrTitle")}
              </span>
              <span className={styles.methodDescription}>
                {isMobile
                  ? t("connectAppDescription")
                  : t("connectQrDescription")}
              </span>
            </div>
          </Button>

          <Button
            type="button"
            variant="primary"
            fullWidth
            className={styles.methodButton}
            onClick={onSelectNip46Bunker}
            disabled={disabled}
          >
            <LinkIcon size={20} />
            <div className={styles.methodInfo}>
              <span className={styles.methodName}>
                {t("connectBunkerTitle")}
              </span>
              <span className={styles.methodDescription}>
                {t("connectBunkerDescription")}
              </span>
            </div>
          </Button>
        </div>
      ) : null}

      {showNsec ? (
        <Button
          type="button"
          variant="ghost"
          fullWidth
          className={styles.methodButton}
          onClick={onSelectNsec}
          disabled={disabled}
        >
          <KeyIcon size={20} />
          <div className={styles.methodInfo}>
            <span className={styles.methodName}>{t("nsecTitle")}</span>
            <span className={styles.methodDescription}>
              {t("nsecDescription")}
            </span>
          </div>
        </Button>
      ) : null}
    </div>
  );
}

export default SignerMethodButtons;
