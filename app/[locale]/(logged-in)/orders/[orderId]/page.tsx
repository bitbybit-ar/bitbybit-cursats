import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/routing";
import { Card } from "@/components/ui/card";
import { ArrowLeftIcon } from "@/components/icons";
import { getCreatorOrderDetail } from "@/lib/creator/orders";
import { requirePageUser } from "@/lib/creator/page-context";
import styles from "./page.module.scss";

const ParamsSchema = z.object({ orderId: z.string().uuid() });

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; orderId: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({
    locale,
    namespace: "orders.detail",
  });
  return {
    title: t("metadataTitle"),
    robots: { index: false, follow: false },
  };
}

export default async function PanelOrderDetailPage({
  params,
}: {
  params: Promise<{ locale: string; orderId: string }>;
}) {
  const { locale, orderId } = await params;
  setRequestLocale(locale);

  const parsed = ParamsSchema.safeParse({ orderId });
  if (!parsed.success) notFound();

  const { user } = await requirePageUser();
  const order = await getCreatorOrderDetail(user.id, orderId);
  if (!order) notFound();

  const t = await getTranslations("orders.detail");
  const tStatus = await getTranslations("orderStatus");
  const arsFormatter = new Intl.NumberFormat(
    locale === "es" ? "es-AR" : "en-US"
  );
  const dateFormatter = new Intl.DateTimeFormat(
    locale === "es" ? "es-AR" : "en-US",
    { dateStyle: "medium", timeStyle: "short" }
  );

  return (
    <>
      <Link href="/orders" className={styles.back}>
        <ArrowLeftIcon size={16} />
        {t("back")}
      </Link>

      <h1 className={styles.title}>{t("title")}</h1>
      <p className={styles.subtitle}>
        <span
          className={`${styles.status} ${styles[`status-${order.status}`]}`}
        >
          {tStatus(order.status)}
        </span>
      </p>

      <Card variant="default" className={styles.card}>
        <dl className={styles.grid}>
          <dt>{t("orderId")}</dt>
          <dd className={styles.mono}>{order.id}</dd>

          <dt>{t("offering")}</dt>
          <dd>
            {order.offering_slug ? (
              <Link href={`/my-courses/${order.offering_slug}/edit`}>
                {order.offering_title ?? order.offering_slug}
              </Link>
            ) : (
              t("unknownOffering")
            )}
          </dd>

          <dt>{t("createdAt")}</dt>
          <dd>{dateFormatter.format(order.created_at)}</dd>

          <dt>{t("paidAt")}</dt>
          <dd>{order.paid_at ? dateFormatter.format(order.paid_at) : "—"}</dd>

          <dt>{t("amountArs")}</dt>
          <dd>ARS {arsFormatter.format(order.amount_ars)}</dd>

          <dt>{t("amountSats")}</dt>
          <dd>{arsFormatter.format(order.amount_sats)} sats</dd>

          <dt>{t("buyer")}</dt>
          <dd className={styles.mono}>
            {order.pubkey ? order.pubkey : t("anonymous")}
          </dd>

          {order.redemption_code ? (
            <>
              <dt>{t("redemptionCode")}</dt>
              <dd className={styles.mono}>{order.redemption_code}</dd>
            </>
          ) : null}

          {order.payment_hash ? (
            <>
              <dt>{t("paymentHash")}</dt>
              <dd className={styles.mono}>{order.payment_hash}</dd>
            </>
          ) : null}

          {order.wapu_deposit_tx_id ? (
            <>
              <dt>{t("wapuDepositTxId")}</dt>
              <dd className={styles.mono}>{order.wapu_deposit_tx_id}</dd>
            </>
          ) : null}

          {order.wapu_withdrawal_tx_id ? (
            <>
              <dt>{t("wapuWithdrawalTxId")}</dt>
              <dd className={styles.mono}>{order.wapu_withdrawal_tx_id}</dd>
            </>
          ) : null}

          {order.payout_status ? (
            <>
              <dt>{t("payoutStatus")}</dt>
              <dd className={styles.mono}>{order.payout_status}</dd>
            </>
          ) : null}
        </dl>
      </Card>

      <p className={styles.readonlyHint}>{t("readOnlyHint")}</p>
    </>
  );
}
