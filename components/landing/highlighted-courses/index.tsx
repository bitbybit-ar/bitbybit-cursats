import { getTranslations } from "next-intl/server";
import { Container } from "@/components/ui/container";
import { Button } from "@/components/ui/button";
import { OfferingCard } from "@/components/catalog/offering-card";
import { listHighlightedOfferings } from "@/lib/offerings";
import styles from "./highlighted-courses.module.scss";

export async function HighlightedCourses() {
  const rows = await listHighlightedOfferings();
  if (rows.length === 0) return null;

  const t = await getTranslations("landing.highlighted");

  return (
    <Container>
      <header className={styles.header}>
        <h2 className={styles.title}>{t("title")}</h2>
        <p className={styles.subtitle}>{t("subtitle")}</p>
      </header>

      <div className={styles.grid}>
        {rows.map(({ offering, seller }) => (
          <OfferingCard
            key={offering.id}
            offering={offering}
            seller={seller}
          />
        ))}
      </div>

      <div className={styles.actions}>
        <Button
          href="/explore"
          variant="ghost"
          size="default"
          className={styles.exploreButton}
        >
          {t("exploreMore")}
        </Button>
      </div>
    </Container>
  );
}

export default HighlightedCourses;
