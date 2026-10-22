import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { buildPageMetadata } from "@/lib/seo";
import { Hero } from "@/components/landing/hero";
import { HighlightedCourses } from "@/components/landing/highlighted-courses";
import { NeedMotivation } from "@/components/landing/need-motivation";
import { TravelCompanions } from "@/components/landing/travel-companions";
import { SupportBitByBit } from "@/components/landing/support-bitbybit";

type Props = {
  params: Promise<{ locale: string }>;
};

export const revalidate = 60;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "metadata" });
  return buildPageMetadata({
    locale,
    path: "/",
    title: { absolute: t("siteTitle") },
    description: t("description"),
    socialTitle: t("siteTitle"),
  });
}

export default async function HomePage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <>
      <Hero />
      <HighlightedCourses />
      <NeedMotivation />
      <TravelCompanions />
      <SupportBitByBit />
    </>
  );
}
