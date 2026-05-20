"use client";

import { useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/routing";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { useToast } from "@/components/ui/toast";
import { useSignerContext } from "@/lib/contexts/signer-context";
import {
  buildSettingsAuthEvent,
  hashSettingsBody,
} from "@/lib/admin/sign-settings-payload";
import { buildProfileMetadataEvent } from "@/lib/nostr/events";
import { publishSignedEvent } from "@/lib/nostr/publish";
import type { Kind0Profile } from "@/lib/nostr/profile";
import { isSignerCancellation } from "@/lib/nostr/auth-errors";
import styles from "./profile-form.module.scss";

interface ProfileFormProps {
  userSlug: string;
  initialDisplayName: string;
  initialBio: string;
  initialAvatarUrl: string;
  initialBannerUrl: string;
  initialLightningAddress: string;
  /**
   * True when ANY profile field came from kind:0 fallback (no value
   * was set on the cursats row yet). Surfaces a hint at the top of
   * the panel so the user knows the form was pre-filled from their
   * Nostr profile and saving will persist the values.
   */
  prefilledFromNostr: boolean;
}

function emptyToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

export function ProfileForm({
  userSlug,
  initialDisplayName,
  initialBio,
  initialAvatarUrl,
  initialBannerUrl,
  initialLightningAddress,
  prefilledFromNostr,
}: ProfileFormProps) {
  const t = useTranslations("settings.form");
  const tCommon = useTranslations("common");
  const tErr = useTranslations("errors");
  const router = useRouter();
  const { showToast } = useToast();
  const { signWithPrompt } = useSignerContext();

  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [bio, setBio] = useState(initialBio);
  const [avatarUrl, setAvatarUrl] = useState(initialAvatarUrl);
  const [bannerUrl, setBannerUrl] = useState(initialBannerUrl);
  const [lightningAddress, setLightningAddress] = useState(
    initialLightningAddress,
  );
  const [isPending, setIsPending] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);

  async function handleSave(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (isPending) return;

    if (displayName.trim().length < 2) {
      showToast(t("displayNameRequired"), "error");
      return;
    }
    const nextAvatarUrl = emptyToNull(avatarUrl);
    if (nextAvatarUrl !== null) {
      try {
        new URL(nextAvatarUrl);
      } catch {
        showToast(t("avatarUrlInvalid"), "error");
        return;
      }
    }
    const nextBannerUrl = emptyToNull(bannerUrl);
    if (nextBannerUrl !== null) {
      try {
        new URL(nextBannerUrl);
      } catch {
        showToast(t("bannerUrlInvalid"), "error");
        return;
      }
    }

    const nextLightningAddress = emptyToNull(lightningAddress);
    const lightningChanged =
      nextLightningAddress !== emptyToNull(initialLightningAddress);

    setIsPending(true);
    try {
      const serialized = JSON.stringify({
        display_name: displayName.trim(),
        bio: emptyToNull(bio),
        avatar_url: nextAvatarUrl,
        banner_url: nextBannerUrl,
        lightning_address: nextLightningAddress,
      });

      const headers: Record<string, string> = {
        "content-type": "application/json",
      };

      // LN-address changes require a NIP-98 re-sign (ADR 0008/0015).
      if (lightningChanged) {
        const url = new URL(
          "/api/settings",
          window.location.origin,
        ).toString();
        const payloadHash = await hashSettingsBody(serialized);
        const unsigned = buildSettingsAuthEvent(url, payloadHash);
        try {
          const signed = await signWithPrompt(unsigned);
          headers.Authorization = `Nostr ${btoa(JSON.stringify(signed))}`;
        } catch (err) {
          if (
            isSignerCancellation(err) ||
            (err instanceof Error && err.message === "re_sign_in_cancelled")
          ) {
            showToast(t("signCancelled"), "info");
            return;
          }
          showToast(t("saveFailed"), "error");
          return;
        }
      }

      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers,
        body: serialized,
      });
      if (!res.ok) {
        if (res.status === 401 || res.status === 404) {
          if (res.status === 404) {
            router.push("/");
            return;
          }
          const json = (await res.json().catch(() => null)) as {
            error?: string;
          } | null;
          if (json?.error === "auth_clock_skew") {
            showToast(t("signClockSkew"), "error");
            return;
          }
          showToast(t("signRequiredBody"), "error");
          return;
        }
        if (res.status === 400) {
          const json = (await res.json().catch(() => null)) as {
            error?: string;
            reason?: string;
          } | null;
          if (json?.error === "lightning_address_invalid") {
            // Each reason maps to a distinct seller-facing message —
            // "your provider doesn't speak LUD-21" is actionable
            // (switch providers); "unreachable" is transient (retry).
            const reasonKey: Record<string, string> = {
              invalid_address: "lightningAddressInvalidFormat",
              lnurl_unreachable: "lightningAddressUnreachable",
              lnurl_no_lud21: "lightningAddressNoLud21",
              lnurl_invalid_response: "lightningAddressMalformed",
              bolt11_no_payment_hash: "lightningAddressMalformed",
            };
            const key =
              (json.reason && reasonKey[json.reason]) ||
              "lightningAddressInvalid";
            showToast(t(key), "error");
            return;
          }
        }
        showToast(t("saveFailed"), "error");
        return;
      }
      showToast(t("saved"), "success");
      router.refresh();
    } catch {
      showToast(tErr("network"), "error");
    } finally {
      setIsPending(false);
    }
  }

  async function handleSyncFromRelays() {
    if (isSyncing) return;
    setIsSyncing(true);
    try {
      const res = await fetch("/api/profile/sync-from-nostr", {
        method: "POST",
      });
      if (!res.ok) {
        showToast(t("syncFailed"), "error");
        return;
      }
      const data = (await res.json()) as { profile: Kind0Profile };
      const p = data.profile;
      // Only overwrite a field when relays actually returned a
      // value — preserves any unsaved local edits in fields kind:0
      // doesn't carry.
      if (p.display_name || p.name)
        setDisplayName(p.display_name ?? p.name ?? "");
      if (p.about !== undefined) setBio(p.about ?? "");
      if (p.picture !== undefined) setAvatarUrl(p.picture ?? "");
      if (p.banner !== undefined) setBannerUrl(p.banner ?? "");
      if (p.lud16 !== undefined) setLightningAddress(p.lud16 ?? "");
      showToast(t("syncSuccess"), "success");
    } catch {
      showToast(tErr("network"), "error");
    } finally {
      setIsSyncing(false);
    }
  }

  async function handlePublishToNostr() {
    if (isPublishing) return;
    if (displayName.trim().length < 2) {
      showToast(t("displayNameRequired"), "error");
      return;
    }
    setIsPublishing(true);
    try {
      const metadata: Kind0Profile = {
        display_name: displayName.trim(),
        about: emptyToNull(bio) ?? undefined,
        picture: emptyToNull(avatarUrl) ?? undefined,
        banner: emptyToNull(bannerUrl) ?? undefined,
        lud16: emptyToNull(lightningAddress) ?? undefined,
      };
      const unsigned = buildProfileMetadataEvent(metadata);
      const signed = await signWithPrompt(unsigned);
      publishSignedEvent(signed).catch(() => {});
      showToast(t("publishSuccess"), "success");
    } catch (err) {
      if (
        isSignerCancellation(err) ||
        (err instanceof Error && err.message === "re_sign_in_cancelled")
      ) {
        showToast(t("signCancelled"), "info");
        return;
      }
      showToast(t("publishFailed"), "error");
    } finally {
      setIsPublishing(false);
    }
  }

  return (
    <form className={styles.form} onSubmit={handleSave}>
      <section className={styles.section}>
        <header className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>{t("sectionProfile")}</h2>
          <p className={styles.sectionHint}>
            {t("sectionProfileHint", { slug: userSlug })}
          </p>
          {prefilledFromNostr ? (
            <p className={styles.prefillHint}>{t("prefilledFromNostr")}</p>
          ) : null}
        </header>

        <div className={styles.field}>
          <label htmlFor="display_name" className={styles.label}>
            {t("displayName")}
            <Tooltip
              text={t("displayNameTooltip")}
              example={t("displayNameExample")}
              label={tCommon("tooltipLabel")}
            />
          </label>
          <input
            id="display_name"
            type="text"
            className={styles.input}
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            required
            minLength={2}
            maxLength={80}
          />
        </div>

        <div className={styles.field}>
          <label htmlFor="bio" className={styles.label}>
            {t("bio")}
            <Tooltip text={t("bioTooltip")} label={tCommon("tooltipLabel")} />
          </label>
          <textarea
            id="bio"
            className={styles.textarea}
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            rows={3}
            maxLength={500}
          />
        </div>

        <div className={styles.field}>
          <label htmlFor="avatar_url" className={styles.label}>
            {t("avatarUrl")}
            <Tooltip
              text={t("avatarUrlTooltip")}
              example={t("avatarUrlExample")}
              label={tCommon("tooltipLabel")}
            />
          </label>
          <input
            id="avatar_url"
            type="url"
            inputMode="url"
            className={styles.input}
            value={avatarUrl}
            onChange={(e) => setAvatarUrl(e.target.value)}
            placeholder={t("avatarUrlPlaceholder")}
            autoComplete="off"
            spellCheck={false}
          />
        </div>

        <div className={styles.field}>
          <label htmlFor="banner_url" className={styles.label}>
            {t("bannerUrl")}
            <Tooltip
              text={t("bannerUrlTooltip")}
              example={t("bannerUrlExample")}
              label={tCommon("tooltipLabel")}
            />
          </label>
          <input
            id="banner_url"
            type="url"
            inputMode="url"
            className={styles.input}
            value={bannerUrl}
            onChange={(e) => setBannerUrl(e.target.value)}
            placeholder={t("bannerUrlPlaceholder")}
            autoComplete="off"
            spellCheck={false}
          />
        </div>

        <div className={styles.field}>
          <label htmlFor="lightning_address" className={styles.label}>
            {t("lightningAddress")}
            <Tooltip
              text={t("lightningAddressTooltip")}
              example={t("lightningAddressExample")}
              label={tCommon("tooltipLabel")}
            />
          </label>
          <input
            id="lightning_address"
            type="text"
            inputMode="email"
            className={styles.input}
            value={lightningAddress}
            onChange={(e) => setLightningAddress(e.target.value)}
            placeholder={t("lightningAddressPlaceholder")}
            autoComplete="off"
            spellCheck={false}
          />
        </div>
      </section>

      <div className={styles.actions}>
        <Button type="submit" variant="primary" disabled={isPending}>
          {isPending ? t("saving") : t("save")}
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={handleSyncFromRelays}
          disabled={isSyncing}
        >
          {isSyncing ? t("syncing") : t("syncFromRelays")}
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={handlePublishToNostr}
          disabled={isPublishing}
        >
          {isPublishing ? t("publishing") : t("publishToNostr")}
        </Button>
      </div>
    </form>
  );
}

export default ProfileForm;
