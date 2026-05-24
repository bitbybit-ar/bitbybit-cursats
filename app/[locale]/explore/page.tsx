import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Container } from "@/components/ui/container";
import { OfferingCard } from "@/components/catalog/offering-card";
import { SuggestedForYou } from "@/components/catalog/suggested-for-you";
import { listDiscoveryOfferingsPaged } from "@/lib/offerings";
import { listRecommendedOfferings } from "@/lib/recommendations";
import { getSession } from "@/lib/auth";
import {
  PAGE_SIZE,
  buildExploreHref,
  hasActiveFilters,
  parseExploreParams,
} from "@/lib/explore-params";
import { Controls } from "@/components/catalog/explore-controls";
import { Pager } from "@/components/catalog/explore-pager";
import { buildPageMetadata } from "@/lib/seo";
import styles from "./page.module.scss";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

// Marketplace discovery (ADR 0012). Renders every active user's
// offerings, with search, filters, sort, and pagination driven by
// the querystring so the page stays a server component and links
// stay shareable. Per-seller landing pages live at /[locale]/[slug]
// (ADR 0017).
//
// Personalisation (ADR 0024): when a signed-in buyer hits the
// catalog root with no filters, we render a "Suggested for you"
// rail above the main grid and exclude its picks from the main
// grid (across every page, so the buyer never sees a recommended
// course duplicated as they paginate). Filters or sort flip the
// page back to the canonical, unpersonalised view — buyers who
// reach for a knob have a deliberate query in mind.
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "catalog" });
  return buildPageMetadata({
    locale,
    path: "/explore",
    title: t("metadataTitle"),
    description: t("metadataDescription"),
  });
}

// Rail size on /explore is 4 (wider grid than the 3-up rail on
// /purchases). Logged-in users with no signal still see the
// highlights here, which is the same content the landing's
// hero-adjacent rail renders.
const PERSONALISED_RAIL_SIZE = 4;

export default async function ExplorePage({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const sp = await searchParams;
  const parsed = parseExploreParams(sp);
  const t = await getTranslations("catalog");
  const session = await getSession();

  const isFiltered = hasActiveFilters(parsed);
  const isPersonalisable = !!session && !isFiltered;

  // Pre-fetch the rail so we can use the picked ids to exclude
  // them from the main grid. The rail itself only renders on
  // page 1 — but we keep the exclusion live on every page so a
  // recommended course can't surface in the main grid later in
  // the pagination either.
  const recommendations = isPersonalisable
    ? await listRecommendedOfferings({
        pubkey: session!.pubkey,
        limit: PERSONALISED_RAIL_SIZE,
      })
    : null;
  const recommendedIds = recommendations?.rows.map((r) => r.offering.id) ?? [];

  const { rows, total } = await listDiscoveryOfferingsPaged({
    q: parsed.q || undefined,
    type: parsed.type ?? undefined,
    sort: parsed.sort,
    page: parsed.page,
    pageSize: PAGE_SIZE,
    excludeOfferingIds: recommendedIds,
  });

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const emptyKey = isFiltered ? "list.noMatches" : "list.empty";

  // The rail renders only on page 1. Subsequent pages still
  // exclude the recommended ids from the main grid, but the
  // rail itself disappears so the page reads as "more catalog"
  // rather than "here are the same recommendations again".
  const showRail =
    isPersonalisable && parsed.page === 1 && recommendations !== null;
  const showMainHeading =
    isPersonalisable &&
    recommendations !== null &&
    recommendations.rows.length > 0;

  return (
    <Container>
      <h1 className={styles.heading}>{t("list.heading")}</h1>
      <Controls current={parsed} />

      {showRail ? (
        <SuggestedForYou
          pubkey={session!.pubkey}
          result={recommendations!}
          showExploreMore={false}
        />
      ) : null}

      {showMainHeading ? (
        <h2 className={styles.mainHeading}>{t("list.moreToExplore")}</h2>
      ) : null}

      <p className={styles.results}>{t("list.results", { count: total })}</p>
      {rows.length === 0 ? (
        <p className={styles.empty}>{t(emptyKey)}</p>
      ) : (
        <>
          <div className={styles.grid}>
            {rows.map(({ offering, seller }) => (
              <OfferingCard
                key={offering.id}
                offering={offering}
                seller={seller}
              />
            ))}
          </div>
          {total > PAGE_SIZE && (
            <Pager
              page={parsed.page}
              totalPages={totalPages}
              prevHref={
                parsed.page > 1
                  ? buildExploreHref(parsed, { page: parsed.page - 1 })
                  : null
              }
              nextHref={
                parsed.page < totalPages
                  ? buildExploreHref(parsed, { page: parsed.page + 1 })
                  : null
              }
            />
          )}
        </>
      )}
    </Container>
  );
}
