import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "@/i18n/routing";
import { Container } from "@/components/ui/container";
import { Section } from "@/components/ui/section";
import { Card } from "@/components/ui/card";
import { ClaimForm } from "./claim-form";
import { getSession } from "@/lib/auth";
import { alternatesFor } from "@/lib/seo";
import { getOrder } from "@/lib/orders";
import { getOfferingById } from "@/lib/offerings";
import styles from "./page.module.scss";

const ParamsSchema = z.object({ orderId: z.string().uuid() });

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; orderId: string }>;
}): Promise<Metadata> {
  const { locale, orderId } = await params;
  const t = await getTranslations({ locale, namespace: "claim" });
  return {
    title: t("metadataTitle"),
    robots: { index: false, follow: false },
    alternates: alternatesFor(locale, `/claim/${orderId}`),
  };
}

export default async function ClaimPage({
  params,
}: {
  params: Promise<{ locale: string; orderId: string }>;
}) {
  const { locale, orderId } = await params;
  setRequestLocale(locale);

  const parsed = ParamsSchema.safeParse({ orderId });
  if (!parsed.success) notFound();

  const session = await getSession();
  if (!session) {
    redirect({
      href: `/sign-in?next=/claim/${orderId}`,
      locale,
    });
    // next-intl's `redirect` throws but is not typed `never`, so the
    // unreachable return narrows `session` for the rest of the body.
    return null;
  }

  const order = await getOrder(orderId);
  if (!order) notFound();

  // Already claimed by this buyer — bounce straight to the receipt
  // rather than showing a confusing "claim" form for an order that
  // is already attached.
  if (order.pubkey === session.pubkey) {
    redirect({ href: `/receipt/${orderId}`, locale });
  }

  const offering = await getOfferingById(order.offering_id);
  const t = await getTranslations("claim");

  // The order already belongs to a *different* pubkey — surface a
  // dedicated state instead of rendering the claim CTA, since the
  // POST would 409 anyway.
  if (order.pubkey !== null) {
    return (
      <Section>
        <Container>
          <Card variant="default" className={styles.card}>
            <h1 className={styles.title}>{t("alreadyClaimed.title")}</h1>
            <p className={styles.subtitle}>{t("alreadyClaimed.body")}</p>
          </Card>
        </Container>
      </Section>
    );
  }

  return (
    <Section>
      <Container>
        <Card variant="default" className={styles.card}>
          <h1 className={styles.title}>{t("title")}</h1>
          <p className={styles.subtitle}>{t("subtitle")}</p>

          <dl className={styles.summary}>
            <dt>{t("offering")}</dt>
            <dd>{offering?.title ?? t("unknownOffering")}</dd>
            <dt>{t("orderId")}</dt>
            <dd className={styles.orderId}>{order.id}</dd>
          </dl>

          <ClaimForm orderId={order.id} />
        </Card>
      </Container>
    </Section>
  );
}
