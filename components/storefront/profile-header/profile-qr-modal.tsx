"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { QRCodeSVG } from "qrcode.react";
import { Modal } from "@/components/ui/modal";
import { CopyIcon, CheckIcon } from "@/components/icons";
import { useClipboard } from "@/lib/hooks/useClipboard";
import { cn } from "@/lib/utils";
import styles from "./profile-header.module.scss";

interface ProfileQrModalProps {
  npub: string;
  lightningAddress: string | null;
  onClose: () => void;
}

type Tab = "identity" | "lightning";

/**
 * Two-tab QR popup for a seller profile: their Nostr identity (npub)
 * and, when set, their Lightning address. Each tab shows a scannable
 * QR plus a copy button.
 */
export function ProfileQrModal({
  npub,
  lightningAddress,
  onClose,
}: ProfileQrModalProps) {
  const t = useTranslations("storefront.qr");
  const [tab, setTab] = useState<Tab>("identity");
  const identityClip = useClipboard();
  const lnClip = useClipboard();

  const showLightning = Boolean(lightningAddress);
  const activeTab = showLightning ? tab : "identity";

  return (
    <Modal title={t("title")} onClose={onClose} size="md">
      {showLightning ? (
        <div className={styles.qrTabs} role="tablist" aria-label={t("title")}>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "identity"}
            className={cn(
              styles.qrTab,
              activeTab === "identity" && styles.qrTabActive
            )}
            onClick={() => setTab("identity")}
          >
            {t("identityTab")}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "lightning"}
            className={cn(
              styles.qrTab,
              activeTab === "lightning" && styles.qrTabActive
            )}
            onClick={() => setTab("lightning")}
          >
            {t("lightningTab")}
          </button>
        </div>
      ) : null}

      {activeTab === "identity" ? (
        <div className={styles.qrPanel} role="tabpanel">
          <div className={styles.qrFrame}>
            <QRCodeSVG value={npub} size={220} level="M" marginSize={2} />
          </div>
          <p className={styles.qrValue}>{npub}</p>
          <button
            type="button"
            className={styles.copyButton}
            onClick={() => identityClip.copy(npub)}
          >
            {identityClip.copied ? (
              <CheckIcon size={16} />
            ) : (
              <CopyIcon size={16} />
            )}
            {identityClip.copied ? t("copied") : t("copyNpub")}
          </button>
        </div>
      ) : (
        <div className={styles.qrPanel} role="tabpanel">
          <div className={styles.qrFrame}>
            <QRCodeSVG
              value={`lightning:${lightningAddress}`}
              size={220}
              level="M"
              marginSize={2}
            />
          </div>
          <p className={styles.qrValue}>{lightningAddress}</p>
          <button
            type="button"
            className={styles.copyButton}
            onClick={() => lnClip.copy(lightningAddress ?? "")}
          >
            {lnClip.copied ? <CheckIcon size={16} /> : <CopyIcon size={16} />}
            {lnClip.copied ? t("copied") : t("copyAddress")}
          </button>
        </div>
      )}
    </Modal>
  );
}

export default ProfileQrModal;
