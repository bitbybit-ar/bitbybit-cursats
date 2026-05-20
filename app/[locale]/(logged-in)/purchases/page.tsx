import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect, Link } from "@/i18n/routing";
import { Card } from "@/components/ui/card";
import { ArrowRightIcon } from "@/components/icons";
import { getSession } from "@/lib/auth";
import { alternatesFor } from "@/lib/seo";
import { listOrdersByPubkey } from "@/lib/orders";
import { getOfferingById } from "@/lib/offerings";
import styles from "./page.module.scss";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "account" });
  return {
    title: t("metadataTitle"),
    robots: { index: false, follow: true },
    alternates: alternatesFor(locale, "/purchases"),
  };
}

export default async function MisComprasPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await getSession();
  if (!session) {
    redirect({ href: "/sign-in?next=/purchases", locale });
    // next-intl's `redirect` throws but is not typed `never`, so the
    // unreachable return narrows `session` for the rest of the body.
    return null;
  }

  const t = await getTranslations("account");
  const tStatus = await getTranslations("orderStatus");

  const orders = await listOrdersByPubkey(session.pubkey);
  // Hydrate offering titles in parallel — small N (≤20 per page),
  // single query per row is fine; promote to a join helper if the
  // page ever paginates beyond 50 rows.
  const offerings = await Promise.all(
    orders.map((o) => getOfferingById(o.offering_id))
  );

  const dateFormatter = new Intl.DateTimeFormat(
    locale === "es" ? "es-AR" : "en-US",
    { dateStyle: "medium" }
  );

  return (
    <>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>{t("title")}</h1>
          <p className={styles.subtitle}>{t("subtitle")}</p>
        </div>
      </header>

      {orders.length === 0 ? (
        <Card variant="default" className={styles.empty}>
          <p>{t("empty")}</p>
          <Link href="/" className={styles.emptyLink}>
            {t("browseCatalog")} <ArrowRightIcon size={16} />
          </Link>
        </Card>
      ) : (
        <ul className={styles.list}>
          {orders.map((order, i) => {
            const offering = offerings[i];
            return (
              <li key={order.id} className={styles.item}>
                <Link href={`/receipt/${order.id}`} className={styles.row}>
                  <div className={styles.rowMain}>
                    <span className={styles.rowTitle}>
                      {offering?.title ?? t("unknownOffering")}
                    </span>
                    <span className={styles.rowMeta}>
                      {dateFormatter.format(order.created_at)} ·{" "}
                      {order.amount_sats.toLocaleString(
                        locale === "es" ? "es-AR" : "en-US"
                      )}{" "}
                      sats
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
            );
          })}
        </ul>
      )}
    </>
  );
}
