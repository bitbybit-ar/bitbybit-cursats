import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/routing";
import { Card } from "@/components/ui/card";
import { ArrowRightIcon } from "@/components/icons";
import { BackToCatalog } from "@/components/courses/back-to-catalog";
import { Pager } from "@/components/catalog/explore-pager";
import { OrdersFilter } from "@/components/orders/orders-filter";
import {
  listCreatorOrdersPaged,
  orderDisplayStatus,
} from "@/lib/creator/orders";
import {
  ORDERS_PAGE_SIZE,
  buildOrdersHref,
  ordersHasActiveFilters,
  parseOrdersParams,
} from "@/lib/orders-params";
import { requirePageUser } from "@/lib/creator/page-context";
import { SyncOrdersButton } from "@/components/orders/sync-orders-button";
import styles from "./page.module.scss";

export const dynamic = "force-dynamic";

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
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const sp = await searchParams;
  const parsed = parseOrdersParams(sp);
  const { user } = await requirePageUser();
  const { rows, total } = await listCreatorOrdersPaged(user.id, {
    offeringSlug: parsed.course || undefined,
    status: parsed.status,
    page: parsed.page,
    pageSize: ORDERS_PAGE_SIZE,
  });

  const t = await getTranslations("orders");
  const tLabel = await getTranslations("orderLabel");
  const arsFormatter = new Intl.NumberFormat(
    locale === "es" ? "es-AR" : "en-US"
  );
  const dateFormatter = new Intl.DateTimeFormat(
    locale === "es" ? "es-AR" : "en-US",
    { dateStyle: "short", timeStyle: "short" }
  );

  const totalPages = Math.max(1, Math.ceil(total / ORDERS_PAGE_SIZE));
  const isFiltered = ordersHasActiveFilters(parsed);
  // Show the controls whenever there is something to filter or a filter
  // is already active; a pristine, never-sold account just sees the
  // empty card.
  const showControls = total > 0 || isFiltered;

  return (
    <>
      <BackToCatalog />
      <header className={styles.header}>
        <div className={styles.headerTop}>
          <h1 className={styles.title}>{t("title")}</h1>
          <SyncOrdersButton />
        </div>
        <p className={styles.subtitle}>{t("subtitle")}</p>
        {parsed.course ? (
          <p className={styles.filterNote}>
            {t("filteredBy", {
              course: rows[0]?.offering_title ?? parsed.course,
            })}{" "}
            <Link
              href={buildOrdersHref(parsed, { course: "" })}
              className={styles.clearFilter}
            >
              {t("clearFilter")}
            </Link>
          </p>
        ) : null}
      </header>

      {showControls ? <OrdersFilter current={parsed} /> : null}

      {rows.length === 0 ? (
        <Card variant="default" className={styles.empty}>
          <p>{isFiltered ? t("noMatches") : t("empty")}</p>
        </Card>
      ) : (
        <ul className={styles.list}>
          {rows.map((order) => {
            const { key, tone } = orderDisplayStatus(order);
            return (
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
                    className={`${styles.status} ${styles[`status-${tone}`]}`}
                  >
                    {tLabel(key)}
                  </span>
                  <ArrowRightIcon size={16} />
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {total > ORDERS_PAGE_SIZE ? (
        <Pager
          page={parsed.page}
          totalPages={totalPages}
          prevHref={
            parsed.page > 1
              ? buildOrdersHref(parsed, { page: parsed.page - 1 })
              : null
          }
          nextHref={
            parsed.page < totalPages
              ? buildOrdersHref(parsed, { page: parsed.page + 1 })
              : null
          }
        />
      ) : null}
    </>
  );
}
