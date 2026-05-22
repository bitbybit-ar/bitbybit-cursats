import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/routing";
import { Card } from "@/components/ui/card";
import { ArrowRightIcon } from "@/components/icons";
import { listAdminOrders } from "@/lib/admin/orders";
import { requirePanelUser } from "@/lib/admin/panel-context";
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
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const { user } = await requirePanelUser();
  const orders = await listAdminOrders(user.id);
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
