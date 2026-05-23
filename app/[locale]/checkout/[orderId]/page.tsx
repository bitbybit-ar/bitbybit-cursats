import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "@/i18n/routing";
import { Container } from "@/components/ui/container";
import { Section } from "@/components/ui/section";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PriceTag } from "@/components/catalog/price-tag";
import { LightningQR } from "@/components/checkout/lightning-qr";
import { CheckoutStatus } from "@/components/checkout/checkout-status";
import { getOrder } from "@/lib/orders";
import { getOfferingById } from "@/lib/offerings";
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
  const t = await getTranslations("checkout");
  const tErrors = await getTranslations("errors");

  // BOLT11 is persisted on the orders row at create time (see
  // `createOrder` in lib/orders.ts). If it is missing, the row was
  // written by an older code path or Wapu rejected the invoice; in
  // either case the buyer needs to restart, since the BOLT11 string
  // is not recoverable from `WapuInvoiceState` (the public Wapu
  // status endpoint does not surface it).
  const bolt11 = order.bolt11;
  // Wapu mock invoices have a 10-minute TTL from create time. The
  // expiry is not stored on the row; derive it from created_at.
  // Real Wapu's expiry will need to be persisted in a follow-up.
  const expiresAt = Math.floor(order.created_at.getTime() / 1000) + 10 * 60;

  if (!bolt11) {
    return (
      <Section>
        <Container>
          <Card variant="default" className={styles.errorCard}>
            <h1 className={styles.title}>{tErrors("checkoutFailed")}</h1>
            <Button href="/" variant="outline">
              {t("expiredCta")}
            </Button>
          </Card>
        </Container>
      </Section>
    );
  }

  return (
    <Section>
      <Container>
        <article className={styles.layout}>
          <header className={styles.header}>
            <h1 className={styles.title}>{t("title")}</h1>
            <p className={styles.instructions}>{t("instructions")}</p>
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

            <LightningQR bolt11={bolt11} />

            <CheckoutStatus
              orderId={order.id}
              initialStatus={order.status}
              expiresAt={expiresAt}
            />

            {offering ? (
              <p className={styles.offeringName}>{offering.title}</p>
            ) : null}
          </Card>
        </article>
      </Container>
    </Section>
  );
}
