import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { OfferingForm } from "@/components/courses/offering-form";
import { requirePageUser } from "@/lib/creator/page-context";
import styles from "./page.module.scss";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({
    locale,
    namespace: "createCourse",
  });
  return {
    title: t("metadataTitle"),
    robots: { index: false, follow: false },
  };
}

export default async function NewOfferingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("createCourse");
  const { user } = await requirePageUser();

  return (
    <>
      <h1 className={styles.title}>{t("title")}</h1>
      <p className={styles.subtitle}>{t("subtitle")}</p>

      <OfferingForm
        payoutState={{
          cbu: user.cbu ?? "",
          alias: user.alias ?? "",
          lightningAddress: user.lightning_address ?? "",
          payoutMethod: user.payout_method,
          nwcConnected: Boolean(user.nwc_uri),
        }}
      />
    </>
  );
}
