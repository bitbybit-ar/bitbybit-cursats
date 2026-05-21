import { getTranslations } from "next-intl/server";
import { Container } from "@/components/ui/container";
import { Button } from "@/components/ui/button";
import { OfferingCard } from "@/components/catalog/offering-card";
import { listHighlightedOfferings } from "@/lib/offerings";
import { RevealHeader } from "./reveal-header";
import { RevealGrid } from "./reveal-grid";
import styles from "./highlighted-courses.module.scss";

export async function HighlightedCourses() {
  const rows = await listHighlightedOfferings();
  if (rows.length === 0) return null;

  const t = await getTranslations("landing.highlighted");

  return (
    <Container className={styles.container}>
      <RevealHeader
        className={styles.header}
        titleClassName={styles.title}
        subtitleClassName={styles.subtitle}
        title={t("title")}
        subtitle={t("subtitle")}
      />

      <RevealGrid className={styles.grid}>
        {rows.map(({ offering, seller }) => (
          <OfferingCard key={offering.id} offering={offering} seller={seller} />
        ))}
      </RevealGrid>

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
