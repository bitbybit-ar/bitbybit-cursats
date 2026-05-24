import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Container } from "@/components/ui/container";
import { Section } from "@/components/ui/section";
import { OfferingCard } from "@/components/catalog/offering-card";
import { ProfileHeader } from "@/components/storefront/profile-header";
import { listOfferingsForUserSlug } from "@/lib/offerings";
import { buildPageMetadata } from "@/lib/seo";
import styles from "./page.module.scss";

type Props = {
  params: Promise<{ locale: string; userSlug: string }>;
};

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, userSlug } = await params;
  const data = await listOfferingsForUserSlug(userSlug);
  if (!data) return {};
  // Lead with the store's own image — banner (wide, ideal for a card)
  // first, then avatar — falling back to the brand card when neither
  // is set.
  const storeImage = data.seller.banner_url ?? data.seller.avatar_url;
  return buildPageMetadata({
    locale,
    path: `/${userSlug}`,
    title: data.seller.display_name,
    description: data.seller.bio?.slice(0, 160) ?? data.seller.display_name,
    socialTitle: `${data.seller.display_name} · CURSATS`,
    image: storeImage
      ? { url: storeImage, alt: data.seller.display_name }
      : undefined,
  });
}

export default async function SellerStorePage({ params }: Props) {
  const { locale, userSlug } = await params;
  setRequestLocale(locale);
  const data = await listOfferingsForUserSlug(userSlug);
  if (!data) notFound();
  const { seller, offerings } = data;

  const t = await getTranslations("storefront");

  return (
    <Container>
      <ProfileHeader
        pubkey={seller.pubkey}
        displayName={seller.display_name}
        avatarUrl={seller.avatar_url}
        bannerUrl={seller.banner_url}
        bio={seller.bio}
        lightningAddress={seller.nostr_lightning_address}
      />

      <Section className={styles.offeringsSection}>
        <h2 className={styles.listHeading}>{t("offeringsHeading")}</h2>
        {offerings.length === 0 ? (
          <p className={styles.empty}>{t("empty")}</p>
        ) : (
          <div className={styles.grid}>
            {offerings.map((offering) => (
              <OfferingCard
                key={offering.id}
                offering={offering}
                seller={{
                  slug: seller.slug,
                  display_name: seller.display_name,
                }}
                hideSeller
              />
            ))}
          </div>
        )}
      </Section>
    </Container>
  );
}
