import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Container } from "@/components/ui/container";
import { FaqList } from "@/components/faq/faq-list";
import { buildPageMetadata } from "@/lib/seo";
import styles from "./page.module.scss";

const CURSATS_REPO_URL = "https://github.com/bitbybit-ar/bitbybit-cursats";

type Props = {
  params: Promise<{ locale: string }>;
};

export const dynamic = "force-static";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "faq" });
  return buildPageMetadata({
    locale,
    path: "/faq",
    title: t("metadataTitle"),
    description: t("metadataDescription"),
  });
}

export default async function FaqPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("faq");

  return (
    <Container>
      <header className={styles.hero}>
        <h1 className={styles.heroTitle}>
          {t.rich("hero.title", {
            gradient: (chunks) => (
              <span className={styles.gradientWord}>{chunks}</span>
            ),
          })}
        </h1>
        <p className={styles.heroSubtitle}>{t("hero.subtitle")}</p>
        <p className={styles.heroSubtitle}>
          {t.rich("hero.subtitleHelp", {
            link: (chunks) => (
              <a
                className={styles.heroLink}
                href={CURSATS_REPO_URL}
                target="_blank"
                rel="noopener noreferrer"
              >
                {chunks}
              </a>
            ),
          })}
        </p>
      </header>

      <FaqList />
    </Container>
  );
}
