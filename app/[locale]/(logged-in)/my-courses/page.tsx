import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/routing";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ArrowRightIcon } from "@/components/icons";
import { listAllOfferings, listArchivedOfferings } from "@/lib/creator/offerings";
import { salesCountByOffering } from "@/lib/creator/orders";
import { requirePageUser } from "@/lib/creator/page-context";
import styles from "./page.module.scss";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "myCourses" });
  return {
    title: t("metadataTitle"),
    robots: { index: false, follow: false },
  };
}

export default async function PanelOfferingsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const { user } = await requirePageUser();
  const [active, archived, salesByOffering] = await Promise.all([
    listAllOfferings(user.id),
    listArchivedOfferings(user.id),
    salesCountByOffering(user.id),
  ]);

  const t = await getTranslations("myCourses");
  const arsFormatter = new Intl.NumberFormat(
    locale === "es" ? "es-AR" : "en-US",
    { maximumFractionDigits: 0 }
  );

  return (
    <>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>{t("title")}</h1>
          <p className={styles.subtitle}>{t("subtitle")}</p>
        </div>
        <Button href="/create-course" variant="primary">
          {t("createCta")}
        </Button>
      </header>

      <section>
        <h2 className={styles.sectionTitle}>{t("activeHeading")}</h2>
        {active.length === 0 ? (
          <Card variant="default" className={styles.empty}>
            <p>{t("emptyActive")}</p>
            <Link href="/create-course" className={styles.emptyLink}>
              {t("createCta")} <ArrowRightIcon size={16} />
            </Link>
          </Card>
        ) : (
          <ul className={styles.list}>
            {active.map((row) => {
              const sales = salesByOffering.get(row.id) ?? 0;
              return (
                <li key={row.id} className={styles.item}>
                  <Link
                    href={`/my-courses/${row.slug}/edit`}
                    className={styles.row}
                  >
                    <div className={styles.rowMain}>
                      <span className={styles.rowTitle}>{row.title}</span>
                      <span className={styles.rowMeta}>
                        <code className={styles.slug}>{row.slug}</code>
                        <span className={styles.dot}>·</span>
                        {t(`type.${row.type}`)}
                        <span className={styles.dot}>·</span>
                        {row.price_currency === "ars" ? "ARS" : "sats"}{" "}
                        {arsFormatter.format(row.price_amount)}
                        <span className={styles.dot}>·</span>
                        {t("salesCount", { count: sales })}
                      </span>
                    </div>
                    <ArrowRightIcon size={16} />
                  </Link>
                  <Link
                    href={`/orders?course=${row.slug}`}
                    className={styles.salesLink}
                  >
                    {t("viewSales")}
                    <ArrowRightIcon size={14} />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {archived.length > 0 ? (
        <section>
          <h2 className={styles.sectionTitle}>{t("archivedHeading")}</h2>
          <ul className={styles.list}>
            {archived.map((row) => (
              <li
                key={row.id}
                className={`${styles.item} ${styles.archivedItem}`}
              >
                <div className={styles.row}>
                  <div className={styles.rowMain}>
                    <span className={styles.rowTitle}>{row.title}</span>
                    <span className={styles.rowMeta}>
                      <code className={styles.slug}>{row.slug}</code>
                      <span className={styles.dot}>·</span>
                      {t("archivedAt", {
                        date: new Intl.DateTimeFormat(
                          locale === "es" ? "es-AR" : "en-US",
                          { dateStyle: "medium" }
                        ).format(row.archived_at!),
                      })}
                    </span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}
