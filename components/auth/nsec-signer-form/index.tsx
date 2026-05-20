"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { decode } from "nostr-tools/nip19";
import { getPublicKey } from "nostr-tools/pure";
import { hexToBytes } from "nostr-tools/utils";
import { Button } from "@/components/ui/button";
import { EyeIcon, EyeOffIcon } from "@/components/icons";
import { type SignerHandle, makeNsecSigner } from "@/lib/nostr/signers";
import {
  type AuthError,
  loginError,
  reSignInError,
} from "@/lib/nostr/auth-errors";
import styles from "./nsec-signer-form.module.scss";

interface NsecSignerFormProps {
  onSigner: (signer: SignerHandle) => void | Promise<void>;
  onError?: (error: AuthError) => void;
  /** When provided, the derived pubkey must match this value. */
  expectedPubkey?: string;
  /** Show the "I understand the risks" checkbox (login flow). */
  requireAcceptRisk?: boolean;
  /** Show the top warning block. */
  showWarning?: boolean;
  submitLabel: string;
  submittingLabel: string;
}

function parseSecretKey(input: string): Uint8Array {
  const trimmed = input.trim();
  if (trimmed.startsWith("nsec1")) {
    const decoded = decode(trimmed);
    if (decoded.type !== "nsec") throw new Error("invalid");
    return decoded.data;
  }
  if (/^[0-9a-f]{64}$/i.test(trimmed)) {
    return hexToBytes(trimmed);
  }
  throw new Error("invalid");
}

/**
 * Nsec paste form. Parses the key client-side, derives the pubkey,
 * optionally checks against `expectedPubkey`, and emits a
 * `SignerHandle` via `onSigner`. The parent decides whether that
 * triggers a NIP-98 login or a re-attach.
 */
export function NsecSignerForm({
  onSigner,
  onError,
  expectedPubkey,
  requireAcceptRisk = false,
  showWarning = false,
  submitLabel,
  submittingLabel,
}: NsecSignerFormProps) {
  const t = useTranslations("login");
  const [nsecKey, setNsecKey] = useState("");
  const [isNsecVisible, setIsNsecVisible] = useState(false);
  const [isRiskAccepted, setIsRiskAccepted] = useState(!requireAcceptRisk);
  const [isBusy, setIsBusy] = useState(false);

  const handleSubmit = async () => {
    setIsBusy(true);
    try {
      const secretKey = parseSecretKey(nsecKey);
      const pubkey = getPublicKey(secretKey);
      if (expectedPubkey && pubkey !== expectedPubkey) {
        // Wrong key for the existing session — keep the input so the
        // user can edit a typo without re-pasting from scratch.
        onError?.(reSignInError("mismatch"));
        return;
      }
      setNsecKey("");
      await onSigner(makeNsecSigner(secretKey, pubkey));
    } catch {
      // Invalid format / decode error: keep the value so the user
      // can edit and retry. Surface the localised error.
      onError?.(loginError("nsecInvalidKey"));
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <>
      {showWarning ? (
        <p className={styles.warning}>{t("nsecWarning")}</p>
      ) : null}

      <label htmlFor="nsec-input" className={styles.label}>
        {t("nsecLabel")}
      </label>
      <div className={styles.inputWrapper}>
        <input
          id="nsec-input"
          type={isNsecVisible ? "text" : "password"}
          className={styles.input}
          placeholder={t("nsecPlaceholder")}
          value={nsecKey}
          onChange={(e) => setNsecKey(e.target.value)}
          autoComplete="off"
          spellCheck={false}
        />
        <button
          type="button"
          className={styles.toggle}
          onClick={() => setIsNsecVisible((v) => !v)}
          aria-label={isNsecVisible ? t("hideKey") : t("showKey")}
        >
          {isNsecVisible ? <EyeOffIcon size={16} /> : <EyeIcon size={16} />}
        </button>
      </div>

      {requireAcceptRisk ? (
        <label className={styles.checkbox}>
          <input
            type="checkbox"
            checked={isRiskAccepted}
            onChange={(e) => setIsRiskAccepted(e.target.checked)}
          />
          <span>{t("nsecAcceptRisk")}</span>
        </label>
      ) : null}

      <Button
        type="button"
        variant="primary"
        size="sm"
        fullWidth
        onClick={handleSubmit}
        disabled={!nsecKey.trim() || !isRiskAccepted || isBusy}
      >
        {isBusy ? submittingLabel : submitLabel}
      </Button>
    </>
  );
}

export default NsecSignerForm;
