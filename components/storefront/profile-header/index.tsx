"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { npubEncode } from "nostr-tools/nip19";
import { Avatar } from "@/components/common/avatar";
import { ZapModal } from "@/components/landing/zap-modal";
import {
  BoltIcon,
  CheckIcon,
  ExternalLinkIcon,
  QrIcon,
} from "@/components/icons";
import { useNostrProfile } from "@/lib/hooks/useNostrProfile";
import { verifyNip05 } from "@/lib/nostr/nip05";
import { ProfileQrModal } from "./profile-qr-modal";
import styles from "./profile-header.module.scss";

interface ProfileHeaderProps {
  pubkey: string;
  displayName: string;
  avatarUrl: string | null;
  bannerUrl: string | null;
  bio: string | null;
  /**
   * The seller's public Nostr Lightning Address (`nostr_lightning_address`,
   * the kind:0 lud16) from the DB — used for the zap button + LN QR.
   * Falls back to the live kind:0 lud16 below when the row has none.
   */
  lightningAddress: string | null;
}

/**
 * Seller storefront header: avatar, name, NIP-05 (with a verified
 * badge), bio, a "Send a zap" button, a "View on njump.me" link, and a
 * QR button (top-right) opening a two-tab popup (npub / Lightning).
 * Rendered over the banner image with a dark overlay so the text stays
 * legible on busy banners; falls back to theme colors with no banner.
 *
 * NIP-05 and the Lightning fallback come from the seller's kind:0
 * metadata fetched client-side; the DB Lightning address wins when set.
 */
export function ProfileHeader({
  pubkey,
  displayName,
  avatarUrl,
  bannerUrl,
  bio,
  lightningAddress,
}: ProfileHeaderProps) {
  const t = useTranslations("storefront");
  const { profile } = useNostrProfile(pubkey);
  const [nip05Verified, setNip05Verified] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [zapOpen, setZapOpen] = useState(false);

  const nip05 = profile?.nip05?.trim() || null;
  const effectiveLnAddress = lightningAddress || profile?.lud16 || null;

  let npub: string | null = null;
  try {
    npub = npubEncode(pubkey);
  } catch {
    npub = null;
  }

  useEffect(() => {
    if (!nip05) {
      setNip05Verified(false);
      return;
    }
    const controller = new AbortController();
    let cancelled = false;
    verifyNip05(nip05, pubkey, { signal: controller.signal }).then((ok) => {
      if (!cancelled) setNip05Verified(ok);
    });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [nip05, pubkey]);

  return (
    <div className={styles.hero} data-has-banner={bannerUrl ? "true" : "false"}>
      {bannerUrl ? (
        <Image
          src={bannerUrl}
          alt=""
          fill
          sizes="100vw"
          className={styles.bannerImage}
          priority
        />
      ) : null}
      <div className={styles.overlay} />

      {npub ? (
        <button
          type="button"
          className={styles.qrButton}
          onClick={() => setQrOpen(true)}
          aria-label={t("qr.openLabel")}
        >
          <QrIcon size={18} />
        </button>
      ) : null}

      <div className={styles.content}>
        <Avatar
          src={avatarUrl}
          alt=""
          name={displayName}
          size="lg"
          className={styles.avatar}
        />
        <div className={styles.identity}>
          <h1 className={styles.name}>{displayName}</h1>
          {nip05 ? (
            <p className={styles.nip05}>
              <span>{nip05}</span>
              {nip05Verified ? (
                <span
                  className={styles.verified}
                  title={t("nip05Verified")}
                  aria-label={t("nip05Verified")}
                >
                  <CheckIcon size={12} />
                </span>
              ) : null}
            </p>
          ) : null}
          {bio ? <p className={styles.bio}>{bio}</p> : null}
          <div className={styles.actions}>
            {effectiveLnAddress ? (
              <button
                type="button"
                className={styles.zapButton}
                onClick={() => setZapOpen(true)}
              >
                <BoltIcon size={16} />
                {t("sendZap")}
              </button>
            ) : null}
            {npub ? (
              <a
                href={`https://njump.me/${npub}`}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.njumpButton}
              >
                {t("viewOnNjump")}
                <ExternalLinkIcon size={14} />
              </a>
            ) : null}
          </div>
        </div>
      </div>

      {qrOpen && npub ? (
        <ProfileQrModal
          npub={npub}
          lightningAddress={effectiveLnAddress}
          onClose={() => setQrOpen(false)}
        />
      ) : null}
      {zapOpen && effectiveLnAddress ? (
        <ZapModal
          lightningAddress={effectiveLnAddress}
          onClose={() => setZapOpen(false)}
        />
      ) : null}
    </div>
  );
}

export default ProfileHeader;
