import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/routing";
import { Container } from "@/components/ui/container";
import { Section } from "@/components/ui/section";
import { Card } from "@/components/ui/card";
import { CheckIcon, ArrowLeftIcon } from "@/components/icons";
import { ReceiptCode } from "@/components/receipt/receipt-code";
import { ReceiptDownload } from "@/components/receipt/receipt-download";
import { NostrPromptCard } from "@/components/receipt/nostr-prompt-card";
import { getOrder } from "@/lib/orders";
import { getOfferingById } from "@/lib/offerings";
import styles from "./page.module.scss";

type Props = {
  params: Promise<{ locale: string; orderId: string }>;
};

export const dynamic = "force-dynamic";

export default async function ReceiptPage({ params }: Props) {
  const { locale, orderId } = await params;
  setRequestLocale(locale);

  const order = await getOrder(orderId);
  if (!order) notFound();

  const offering = await getOfferingById(order.offering_id);
  const t = await getTranslations("receipt");

  if (order.status !== "paid") {
    return (
      <>
        {/* Auto-refresh while we wait for the webhook. */}
        <meta httpEquiv="refresh" content="5" />
        <Section>
          <Container>
            <Card variant="default" className={styles.pendingCard}>
              <span className={styles.spinner} aria-hidden />
              <h1 className={styles.title}>{t("pending.title")}</h1>
              <p className={styles.subtitle}>{t("pending.body")}</p>
              <Link href={`/checkout/${orderId}`} className={styles.backLink}>
                <ArrowLeftIcon size={16} />
                {t("pending.back")}
              </Link>
            </Card>
          </Container>
        </Section>
      </>
    );
  }

  return (
    <Section>
      <Container>
        <article className={styles.layout}>
          <header className={styles.header}>
            <span className={styles.successBadge} aria-hidden>
              <CheckIcon size={28} />
            </span>
            <h1 className={styles.title}>{t("title")}</h1>
            <p className={styles.subtitle}>{t("subtitle")}</p>
          </header>

          {offering ? (
            <p className={styles.offeringName}>{offering.title}</p>
          ) : null}

          <p className={styles.settlement}>
            {t(
              order.rail === "direct_lightning"
                ? "settlement.sats"
                : "settlement.ars"
            )}
          </p>

          {offering?.type === "code" ? (
            <ReceiptCode code={order.redemption_code} />
          ) : null}

          {offering?.type === "download" ? (
            <ReceiptDownload
              orderId={orderId}
              isAvailable={offering.download_url !== null}
            />
          ) : null}

          {order.pubkey === null ? <NostrPromptCard orderId={orderId} /> : null}
        </article>
      </Container>
    </Section>
  );
}
