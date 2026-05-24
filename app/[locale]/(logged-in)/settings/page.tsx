import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ProfileForm } from "@/components/settings/profile-form";
import { PayoutForm } from "@/components/settings/payout-form";
import { PreferencesForm } from "@/components/settings/preferences-form";
import { DangerZoneForm } from "@/components/settings/danger-zone-form";
import { SettingsNav } from "@/components/settings/settings-nav";
import { isSettingsSection } from "@/components/settings/settings-nav/sections";
import { requirePageUser } from "@/lib/creator/page-context";
import { fetchKind0Profile } from "@/lib/nostr/profile";
import styles from "./page.module.scss";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "settings" });
  return {
    title: t("metadataTitle"),
    robots: { index: false, follow: false },
  };
}

export default async function SettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ section?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const { user } = await requirePageUser();
  const t = await getTranslations("settings");

  const { section: sectionParam } = await searchParams;
  const section =
    sectionParam && isSettingsSection(sectionParam) ? sectionParam : "profile";

  // Best-effort kind:0 read. Whenever the cursats row is missing a
  // field, fall back to whatever the user advertises on Nostr. The
  // user can override either path; saving persists into the cursats
  // row, which then wins on future loads. 3s relay timeout so a
  // slow relay set just returns an empty profile.
  const profile = await fetchKind0Profile(user.pubkey);

  const fromNostrDisplayName =
    !user.display_name && (profile.display_name || profile.name);
  const initialDisplayName =
    user.display_name || profile.display_name || profile.name || "";
  const initialBio = user.bio ?? profile.about ?? "";
  const initialAvatarUrl = user.avatar_url ?? profile.picture ?? "";
  const initialBannerUrl = user.banner_url ?? profile.banner ?? "";
  const initialLightningAddress = user.lightning_address ?? profile.lud16 ?? "";

  const prefilledFromNostr = Boolean(
    fromNostrDisplayName ||
    (!user.bio && profile.about) ||
    (!user.avatar_url && profile.picture) ||
    (!user.banner_url && profile.banner) ||
    (!user.lightning_address && profile.lud16)
  );

  return (
    <>
      <header className={styles.header}>
        <h1 className={styles.title}>{t("title")}</h1>
        <p className={styles.subtitle}>{t("subtitle")}</p>
      </header>

      <div className={styles.shell}>
        <aside className={styles.sidebar}>
          <SettingsNav />
        </aside>
        <div className={styles.content}>
          {section === "profile" ? (
            <ProfileForm
              userSlug={user.slug}
              initialDisplayName={initialDisplayName}
              initialBio={initialBio}
              initialAvatarUrl={initialAvatarUrl}
              initialBannerUrl={initialBannerUrl}
              initialLightningAddress={initialLightningAddress}
              prefilledFromNostr={prefilledFromNostr}
            />
          ) : null}
          {section === "payout" ? (
            <PayoutForm
              initialCbu={user.cbu ?? ""}
              initialAlias={user.alias ?? ""}
              initialPayoutMethod={user.payout_method}
              initialTransferSpeed={user.transfer_speed}
              currentLightningAddress={initialLightningAddress}
              nwcConnected={Boolean(user.nwc_uri)}
            />
          ) : null}
          {section === "preferences" ? (
            <PreferencesForm
              initialLocale={user.locale === "en" ? "en" : "es"}
              initialPrefs={user.notification_prefs ?? {}}
            />
          ) : null}
          {section === "danger" ? <DangerZoneForm /> : null}
        </div>
      </div>
    </>
  );
}
