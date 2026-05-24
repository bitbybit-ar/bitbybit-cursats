import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { BackToCatalog } from "@/components/courses/back-to-catalog";
import { OfferingForm } from "@/components/courses/offering-form";
import { CodePoolSection } from "@/components/courses/code-pool-section";
import { getOfferingForCreator } from "@/lib/creator/offerings";
import { requirePageUser } from "@/lib/creator/page-context";
import styles from "./page.module.scss";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  const t = await getTranslations({
    locale,
    namespace: "myCourses.edit",
  });
  return {
    title: t("metadataTitle", { slug }),
    robots: { index: false, follow: false },
  };
}

export default async function EditOfferingPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  setRequestLocale(locale);

  const { user } = await requirePageUser();
  const offering = await getOfferingForCreator(user.id, slug);
  if (!offering) notFound();

  const t = await getTranslations("myCourses.edit");

  return (
    <>
      <BackToCatalog />
      <h1 className={styles.title}>{t("title")}</h1>
      <p className={styles.subtitle}>
        <code className={styles.slug}>{offering.slug}</code>
        {offering.archived_at ? (
          <span className={styles.archivedTag}>{t("archived")}</span>
        ) : null}
      </p>

      <OfferingForm offering={offering} />
      {offering.type === "code" ? (
        <CodePoolSection
          offeringId={offering.id}
          offeringSlug={offering.slug}
          initialRemaining={offering.code_pool?.length ?? 0}
        />
      ) : null}
    </>
  );
}
