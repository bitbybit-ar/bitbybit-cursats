import type { Metadata } from "next";
import Image from "next/image";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/routing";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ArrowRightIcon, BookIcon } from "@/components/icons";
import { CourseRowActions } from "@/components/courses/course-row-actions";
import {
  listAllOfferings,
  listArchivedOfferings,
} from "@/lib/creator/offerings";
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
        <div className={styles.headerActions}>
          <Button href="/orders" variant="secondary">
            {t("ordersCta")}
          </Button>
          <Button href="/create-course" variant="primary">
            {t("createCta")}
          </Button>
        </div>
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
                  <div className={styles.row}>
                    <div className={styles.thumb}>
                      {row.image_url ? (
                        <Image
                          src={row.image_url}
                          alt=""
                          fill
                          sizes="80px"
                          className={styles.thumbImg}
                          unoptimized
                        />
                      ) : (
                        <span className={styles.thumbPlaceholder}>
                          <BookIcon size={20} />
                        </span>
                      )}
                    </div>
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
                    <CourseRowActions
                      offeringId={row.id}
                      offeringSlug={row.slug}
                      userSlug={user.slug}
                      type={row.type}
                      salesCount={sales}
                      codeRemaining={row.code_pool?.length ?? 0}
                    />
                  </div>
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
                  <div className={styles.thumb}>
                    {row.image_url ? (
                      <Image
                        src={row.image_url}
                        alt=""
                        fill
                        sizes="80px"
                        className={styles.thumbImg}
                        unoptimized
                      />
                    ) : (
                      <span className={styles.thumbPlaceholder}>
                        <BookIcon size={20} />
                      </span>
                    )}
                  </div>
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
