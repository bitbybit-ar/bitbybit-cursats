import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Container } from "@/components/ui/container";
import { Section } from "@/components/ui/section";
import { Polaroid } from "@/components/ui/polaroid";
import { Wordmark } from "@/components/common/wordmark";
import { FeatureDeck } from "@/components/features/feature-deck";
import { TwoRails } from "@/components/features/illustrations/two-rails";
import { NoCustody } from "@/components/features/illustrations/no-custody";
import { AnonymousByDefault } from "@/components/features/illustrations/anonymous-by-default";
import { NostrLogo } from "@/components/features/illustrations/nostr-logo";
import { DeliveryInApp } from "@/components/features/illustrations/delivery-in-app";
import { LightningLogo } from "@/components/features/illustrations/lightning-logo";
import { CreatorAccount } from "@/components/features/illustrations/creator-account";
import { CodesOrDownloads } from "@/components/features/illustrations/codes-or-downloads";
import { OpenMarketplace } from "@/components/features/illustrations/open-marketplace";
import { alternatesFor } from "@/lib/seo";
import styles from "./page.module.scss";

type Props = {
  params: Promise<{ locale: string }>;
};

export const dynamic = "force-static";

// One polaroid per feature. Each gets:
// - An illustration (composed SVG scene) or a single-glyph icon. The
//   `size` field is the render size in px; illustrations get a larger
//   value so they fill more of the polaroid frame like a photo.
// - A colored frame tone — cycled across the brand + accent palette
//   so the 9 polaroids read as a cheerful pinboard, not a uniform grid.
// - A rotation that alternates so the row reads as pinned tiles.
const FEATURES = [
  {
    key: "twoRails",
    icon: TwoRails,
    tone: "blue",
    rotation: "left",
    size: 200,
  },
  {
    key: "noCustody",
    icon: NoCustody,
    tone: "gold",
    rotation: "right",
    size: 200,
  },
  {
    key: "anonymousByDefault",
    icon: AnonymousByDefault,
    tone: "pink",
    rotation: "left",
    size: 200,
  },
  {
    key: "optionalNostrLogin",
    icon: NostrLogo,
    tone: "nostr",
    rotation: "right",
    size: 160,
  },
  {
    key: "deliveryInApp",
    icon: DeliveryInApp,
    tone: "cyan",
    rotation: "left",
    size: 200,
  },
  {
    key: "oneShot",
    icon: LightningLogo,
    tone: "orange",
    rotation: "right",
    size: 160,
  },
  {
    key: "creatorAccount",
    icon: CreatorAccount,
    tone: "blue",
    rotation: "left",
    size: 200,
  },
  {
    key: "codesOrDownloads",
    icon: CodesOrDownloads,
    tone: "lime",
    rotation: "right",
    size: 200,
  },
  {
    key: "openMarketplace",
    icon: OpenMarketplace,
    tone: "gold",
    rotation: "left",
    size: 200,
  },
] as const;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "features" });
  return {
    title: t("metadataTitle"),
    description: t("metadataDescription"),
    alternates: alternatesFor(locale, "/features"),
  };
}

export default async function FeaturesPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("features");

  return (
    <Container>
      <header className={styles.hero}>
        <h1 className={styles.heroTitle}>
          {t.rich("hero.title", { brand: () => <Wordmark /> })}
        </h1>
        <p className={styles.heroSubtitle}>{t("hero.subtitle")}</p>
      </header>
      <FeatureDeck
        slots={FEATURES.map((feature) => {
          const Icon = feature.icon;
          return {
            key: feature.key,
            rotation: feature.rotation,
            // `twoRails` sits visually right where the deck stack
            // is, so it'd barely animate at its natural row-0
            // delay. Defer it to the end and pin to bottom.
            priority:
              feature.key === "twoRails" ? ("last" as const) : undefined,
            children: (
              <Polaroid
                rotation={feature.rotation}
                frame={
                  <span
                    className={`${styles.featureIcon} ${styles[`tone-${feature.tone}`]}`}
                  >
                    <Icon size={feature.size} />
                  </span>
                }
              >
                <h2>{t(`items.${feature.key}Title`)}</h2>
                <p>{t(`items.${feature.key}Body`)}</p>
              </Polaroid>
            ),
          };
        })}
      />
    </Container>
  );
}
