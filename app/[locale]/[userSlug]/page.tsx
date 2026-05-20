import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Image from "next/image";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Container } from "@/components/ui/container";
import { Section } from "@/components/ui/section";
import { OfferingCard } from "@/components/catalog/offering-card";
import { Avatar } from "@/components/common/avatar";
import { listOfferingsForUserSlug } from "@/lib/offerings";
import { alternatesFor } from "@/lib/seo";
import styles from "./page.module.scss";

type Props = {
  params: Promise<{ locale: string; userSlug: string }>;
};

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, userSlug } = await params;
  const data = await listOfferingsForUserSlug(userSlug);
  if (!data) return {};
  return {
    title: data.seller.display_name,
    description: data.seller.bio?.slice(0, 160) ?? data.seller.display_name,
    alternates: alternatesFor(locale, `/${userSlug}`),
  };
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
      <div
        className={styles.hero}
        data-has-banner={seller.banner_url ? "true" : "false"}
      >
        {seller.banner_url ? (
          <Image
            src={seller.banner_url}
            alt=""
            fill
            sizes="100vw"
            className={styles.bannerImage}
            priority
          />
        ) : null}
        <div className={styles.heroOverlay} />
        <div className={styles.heroContent}>
          <Avatar
            src={seller.avatar_url}
            alt=""
            name={seller.display_name}
            size="lg"
            className={styles.heroAvatar}
          />
          <h1 className={styles.title}>{seller.display_name}</h1>
          {seller.bio ? <p className={styles.bio}>{seller.bio}</p> : null}
        </div>
      </div>

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
