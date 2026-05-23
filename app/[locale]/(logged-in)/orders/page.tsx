import type { Metadata } from "next";
import { z } from "zod";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/routing";
import { Card } from "@/components/ui/card";
import { ArrowRightIcon } from "@/components/icons";
import { listAdminOrders } from "@/lib/admin/orders";
import { requirePanelUser } from "@/lib/admin/panel-context";
import { SyncOrdersButton } from "@/components/orders/sync-orders-button";
import styles from "./page.module.scss";

export const dynamic = "force-dynamic";

// The `?course=` filter is a kebab-case offering slug (matches the
// slug constraint in lib/admin/offerings). An invalid value is ignored
// rather than 400'd — it's a display filter, not a mutation, mirroring
// how the explore params coerce. The query is parameterized and scoped
// to the seller's own rows regardless.
const CourseFilterSchema = z
  .string()
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "orders" });
  return {
    title: t("metadataTitle"),
    robots: { index: false, follow: false },
  };
}

export default async function PanelOrdersPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ course?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const { course: rawCourse } = await searchParams;
  const parsedCourse = CourseFilterSchema.safeParse(rawCourse);
  const course = parsedCourse.success ? parsedCourse.data : undefined;
  const { user } = await requirePanelUser();
  const orders = await listAdminOrders(user.id, { offeringSlug: course });
  const t = await getTranslations("orders");
  const tStatus = await getTranslations("orderStatus");
  const arsFormatter = new Intl.NumberFormat(
    locale === "es" ? "es-AR" : "en-US"
  );
  const dateFormatter = new Intl.DateTimeFormat(
    locale === "es" ? "es-AR" : "en-US",
    { dateStyle: "short", timeStyle: "short" }
  );

  return (
    <>
      <header className={styles.header}>
        <div className={styles.headerTop}>
          <h1 className={styles.title}>{t("title")}</h1>
          <SyncOrdersButton />
        </div>
        <p className={styles.subtitle}>{t("subtitle")}</p>
        {course ? (
          <p className={styles.filterNote}>
            {t("filteredBy", {
              course: orders[0]?.offering_title ?? course,
            })}{" "}
            <Link href="/orders" className={styles.clearFilter}>
              {t("clearFilter")}
            </Link>
          </p>
        ) : null}
      </header>

      {orders.length === 0 ? (
        <Card variant="default" className={styles.empty}>
          <p>{t("empty")}</p>
        </Card>
      ) : (
        <ul className={styles.list}>
          {orders.map((order) => (
            <li key={order.id} className={styles.item}>
              <Link href={`/orders/${order.id}`} className={styles.row}>
                <div className={styles.rowMain}>
                  <span className={styles.rowTitle}>
                    {order.offering_title ?? t("unknownOffering")}
                  </span>
                  <span className={styles.rowMeta}>
                    {dateFormatter.format(order.created_at)} · ARS{" "}
                    {arsFormatter.format(order.amount_ars)}
                    {order.pubkey ? (
                      <>
                        <span className={styles.dot}>·</span>
                        <code className={styles.pubkey}>
                          {order.pubkey.slice(0, 8)}…
                        </code>
                      </>
                    ) : (
                      <>
                        <span className={styles.dot}>·</span>
                        <span className={styles.anon}>{t("anonymous")}</span>
                      </>
                    )}
                  </span>
                </div>
                <span
                  className={`${styles.status} ${
                    styles[`status-${order.status}`]
                  }`}
                >
                  {tStatus(order.status)}
                </span>
                <ArrowRightIcon size={16} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
