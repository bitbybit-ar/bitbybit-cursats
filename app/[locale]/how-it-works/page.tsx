import type { Metadata } from "next";
import Image from "next/image";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Section } from "@/components/ui/section";
import { Card } from "@/components/ui/card";
import { Polaroid } from "@/components/ui/polaroid";
import { Button } from "@/components/ui/button";
import { alternatesFor } from "@/lib/seo";
import { AmbientBubbles } from "@/components/how-it-works/ambient-bubbles";
import { HowItWorksJourney } from "@/components/how-it-works/how-it-works-journey";
import styles from "./page.module.scss";

// "Quién es quién" brand logos, vendored into `public/images/logos`
// so the page has no runtime dependency on third-party hosts (the
// upstreams were Wikimedia + two githubusercontent URLs, one of
// which is an unstable comment-upload). Refresh by re-downloading
// from the project's brand page if a mark changes. Wapu's is a JPEG
// (GitHub serves the avatar as JPEG); the others are PNG.
const GLOSSARY_LOGOS = {
  lightning: "/images/logos/lightning.png",
  wapu: "/images/logos/wapu.jpg",
  nostr: "/images/logos/nostr.png",
} as const;

type Props = {
  params: Promise<{ locale: string }>;
};

export const dynamic = "force-static";

export async function generateMetadata({
  params,
}: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "howItWorks" });
  return {
    title: t("metadataTitle"),
    description: t("metadataDescription"),
    alternates: alternatesFor(locale, "/how-it-works"),
  };
}

export default async function HowItWorksPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("howItWorks");

  const buyerSteps = [
    { title: t("buyers.step1Title"), body: t("buyers.step1Body") },
    { title: t("buyers.step2Title"), body: t("buyers.step2Body") },
    { title: t("buyers.step3Title"), body: t("buyers.step3Body") },
  ];

  const creatorSteps = [
    { title: t("creators.step1Title"), body: t("creators.step1Body") },
    { title: t("creators.step2Title"), body: t("creators.step2Body") },
    { title: t("creators.step3Title"), body: t("creators.step3Body") },
  ];

  // Glossary cards — one Polaroid per payment-stack actor, each
  // showing that project's real brand logo. Staggered rotation so
  // they read as photos pinned to a board, not a uniform grid.
  const glossary = [
    {
      title: t("glossary.lightningTitle"),
      body: t("glossary.lightningBody"),
      logo: GLOSSARY_LOGOS.lightning,
      rotation: "left" as const,
      frameTone: styles.glossaryFrameLightning,
    },
    {
      title: t("glossary.wapuTitle"),
      body: t("glossary.wapuBody"),
      logo: GLOSSARY_LOGOS.wapu,
      rotation: "right" as const,
      frameTone: styles.glossaryFrameWapu,
    },
    {
      title: t("glossary.nostrTitle"),
      body: t("glossary.nostrBody"),
      logo: GLOSSARY_LOGOS.nostr,
      rotation: "left" as const,
      frameTone: styles.glossaryFrameNostr,
    },
  ];

  const journeyLabels = {
    buyer: t("journey.buyerLabel"),
    teacher: t("journey.teacherLabel"),
    aria: t("journey.ariaLabel"),
  };

  return (
    <>
      {/* Layer 1 — fixed full-viewport ambient field, behind all
          content (page wrapper claims z-index: 1 above it). */}
      <AmbientBubbles />

      <div className={styles.page}>
        <section className={styles.heroSection}>
          <div className={styles.heroInner}>
            <header className={styles.hero}>
              <h1 className={styles.heroTitle}>
                {t.rich("hero.title", {
                  gradient: (chunks) => (
                    <span className={styles.gradientWord}>{chunks}</span>
                  ),
                })}
              </h1>
              <p className={styles.heroSubtitle}>{t("hero.subtitle")}</p>
            </header>
          </div>
        </section>

        <HowItWorksJourney
          labels={journeyLabels}
          buyerSteps={buyerSteps}
          teacherSteps={creatorSteps}
        />

      <Section>
        <h2 className={styles.sectionTitle}>{t("glossary.title")}</h2>
        <ul className={styles.glossary} aria-label={t("glossary.title")}>
          {glossary.map((item) => (
            <li key={item.title} className={styles.glossaryItem}>
              <Polaroid
                rotation={item.rotation}
                frame={
                  <span
                    className={`${styles.glossaryLogo} ${item.frameTone}`}
                  >
                    <Image
                      src={item.logo}
                      alt={item.title}
                      width={128}
                      height={128}
                      className={styles.glossaryLogoImg}
                    />
                  </span>
                }
              >
                <h3>{item.title}</h3>
                <p>{item.body}</p>
              </Polaroid>
            </li>
          ))}
        </ul>
      </Section>

      <Section>
        <Card variant="highlight" className={styles.custodyCard}>
          <h2 className={styles.custodyTitle}>{t("custody.title")}</h2>
          <p className={styles.custodyBody}>{t("custody.body")}</p>
        </Card>
      </Section>

      <Section>
        <div className={styles.ctaBlock}>
          <h2 className={styles.sectionTitle}>{t("cta.title")}</h2>
          <div className={styles.ctaButtons}>
            <Button
              href="/explore"
              variant="primary"
              size="lg"
              className={styles.cta}
            >
              {t("cta.explore")}
            </Button>
            <Button
              href="/create-course"
              variant="primary"
              size="lg"
              className={`${styles.cta} ${styles.ctaSoft}`}
            >
              {t("cta.publish")}
            </Button>
          </div>
        </div>
      </Section>
      </div>
    </>
  );
}
