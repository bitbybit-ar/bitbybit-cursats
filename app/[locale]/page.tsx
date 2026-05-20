import { setRequestLocale } from "next-intl/server";
import { Hero } from "@/components/landing/hero";
import { HighlightedCourses } from "@/components/landing/highlighted-courses";
import { NeedMotivation } from "@/components/landing/need-motivation";
import { TravelCompanions } from "@/components/landing/travel-companions";
import { SupportBitByBit } from "@/components/landing/support-bitbybit";

type Props = {
  params: Promise<{ locale: string }>;
};

export const revalidate = 60;

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
