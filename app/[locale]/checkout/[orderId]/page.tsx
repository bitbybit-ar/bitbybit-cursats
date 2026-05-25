import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect, Link } from "@/i18n/routing";
import { Container } from "@/components/ui/container";
import { Section } from "@/components/ui/section";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PriceTag } from "@/components/catalog/price-tag";
import { LightningQR } from "@/components/checkout/lightning-qr";
import { CheckoutStatus } from "@/components/checkout/checkout-status";
import { getOrder } from "@/lib/orders";
import { getOfferingById } from "@/lib/offerings";
import { getUserById } from "@/lib/creator/users";
import styles from "./page.module.scss";

type Props = {
  params: Promise<{ locale: string; orderId: string }>;
};

export const dynamic = "force-dynamic";

export default async function CheckoutPage({ params }: Props) {
  const { locale, orderId } = await params;
  setRequestLocale(locale);

  const order = await getOrder(orderId);
  if (!order) notFound();

  if (order.status === "paid") {
    redirect({ href: `/receipt/${orderId}`, locale });
  }

  const offering = await getOfferingById(order.offering_id);
  // Look up the seller so the course title and the "back to the course"
  // CTA point at the storefront detail page. Fall back to the home page
  // if either lookup is missing (a deleted offering or seller).
  const seller = offering ? await getUserById(offering.user_id) : null;
  const courseHref =
    seller && offering ? `/${seller.slug}/c/${offering.slug}` : "/";

  const t = await getTranslations("checkout");
  const tErrors = await getTranslations("errors");
  const tStatus = await getTranslations("orderStatus");

  // BOLT11 is persisted on the orders row at create time (see
  // `createOrder` in lib/orders.ts). If it is missing, the row was
  // written by an older code path or Wapu rejected the invoice; in
  // either case the buyer needs to restart, since the BOLT11 string
  // is not recoverable from `WapuInvoiceState` (the public Wapu
  // status endpoint does not surface it).
  const bolt11 = order.bolt11;

  if (!bolt11) {
    return (
      <Section>
        <Container>
          <Card variant="default" className={styles.errorCard}>
            <h1 className={styles.title}>{tErrors("checkoutFailed")}</h1>
            <Button href={courseHref} variant="outline">
              {t("expiredCta")}
            </Button>
          </Card>
        </Container>
      </Section>
    );
  }

  // Expiry is the invoice's own TTL, persisted at funding time (issue
  // #57). Legacy rows written before that column existed fall back to the
  // historical created_at + 10 min guess.
  const expiresAt = order.expires_at
    ? Math.floor(order.expires_at.getTime() / 1000)
    : Math.floor(order.created_at.getTime() / 1000) + 10 * 60;
  const nowSec = Math.floor(Date.now() / 1000);
  // A pending order past its expiry — or any non-pending order — is
  // terminal: the QR is dead, so hide it and the live poller and point
  // the buyer back to the course instead. `paid` already redirected
  // above, so a non-pending status here is `failed` or `refunded`.
  // (After issue #57 the read-time sweep flips expired rows to `failed`,
  // so a freshly-loaded expired order may arrive as `pending` or
  // `failed`.)
  const isExpired = order.status === "pending" && expiresAt < nowSec;
  const isTerminal = order.status !== "pending" || isExpired;
  const badgeStatus = isExpired ? "expired" : order.status;

  return (
    <Section>
      <Container>
        <article className={styles.layout}>
          <header className={styles.header}>
            <h1 className={styles.title}>{t("title")}</h1>
            {!isTerminal ? (
              <p className={styles.instructions}>{t("instructions")}</p>
            ) : null}
          </header>

          <Card variant="default" className={styles.card}>
            <div className={styles.amount}>
              <span className={styles.amountLabel}>{t("amount")}</span>
              <PriceTag
                priceAmount={order.amount_sats}
                priceCurrency="sats"
                size="lg"
              />
            </div>

            <span
              className={`${styles.status} ${styles[`status-${badgeStatus}`]}`}
            >
              {tStatus(badgeStatus)}
            </span>

            {isTerminal ? (
              <div className={styles.terminal}>
                <p className={styles.terminalMessage}>
                  {isExpired ? t("expired") : t("status.failed")}
                </p>
                <Button href={courseHref} variant="outline">
                  {t("expiredCta")}
                </Button>
              </div>
            ) : (
              <>
                <LightningQR bolt11={bolt11} />

                <CheckoutStatus
                  orderId={order.id}
                  initialStatus={order.status}
                  expiresAt={expiresAt}
                  courseHref={courseHref}
                />
              </>
            )}

            {offering ? (
              <Link href={courseHref} className={styles.offeringName}>
                {offering.title}
              </Link>
            ) : null}
          </Card>
        </article>
      </Container>
    </Section>
  );
}
