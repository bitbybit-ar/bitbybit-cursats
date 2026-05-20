import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { OfferingCard } from "@/components/catalog/offering-card";
import {
  listRecommendedOfferings,
  type RecommendationFallback,
  type RecommendedOfferings,
} from "@/lib/recommendations";
import styles from "./suggested-for-you.module.scss";

interface SuggestedForYouProps {
  /** Signed-in buyer's pubkey. Pass `null`/omit at the call site
   *  for anonymous viewers — the component renders nothing. */
  pubkey: string | null;
  /** Number of cards. Default 3. Ignored when `result` is passed. */
  limit?: number;
  /** Offering ids already rendered elsewhere on the same page,
   *  so the rail does not duplicate them. Ignored when `result`
   *  is passed (the caller is expected to have done the
   *  exclusion already). */
  excludeOfferingIds?: string[];
  /** When provided, links the "Explore more" button to this URL.
   *  Defaults to `/explore`. */
  exploreHref?: string;
  /** Hide the "Explore more →" button. Use on `/explore` itself
   *  where the link would point back to the current page. */
  showExploreMore?: boolean;
  /** Pre-fetched recommendations. When passed, the component
   *  skips the internal `listRecommendedOfferings` call. This
   *  is the path `/explore` takes so it can use the recommended
   *  ids to exclude them from the main grid. */
  result?: RecommendedOfferings;
}

const FALLBACK_TO_SUBTITLE_KEY: Record<RecommendationFallback, string> = {
  tags: "subtitleTags",
  sellers: "subtitleSellers",
  highlights: "subtitleHighlights",
  mixed: "subtitleMixed",
};

/**
 * "Suggested for you" rail. Server component — fetches its own
 * data by default and renders nothing when there are no
 * candidates (instead of an awkward "we have nothing for you"
 * empty state). Callers that need the picked offering ids before
 * render (e.g. to exclude them from a sibling grid) can call
 * `listRecommendedOfferings` themselves and pass the result via
 * the `result` prop. Reuses `OfferingCard` so the rail visually
 * matches `/explore`.
 */
export async function SuggestedForYou({
  pubkey,
  limit = 3,
  excludeOfferingIds,
  exploreHref = "/explore",
  showExploreMore = true,
  result,
}: SuggestedForYouProps) {
  if (!pubkey && !result) return null;

  const resolved =
    result ??
    (await listRecommendedOfferings({
      pubkey: pubkey!,
      limit,
      excludeOfferingIds,
    }));
  if (resolved.rows.length === 0) return null;

  const t = await getTranslations("recommendations");
  const subtitleKey = FALLBACK_TO_SUBTITLE_KEY[resolved.fallback];

  return (
    <section className={styles.section} aria-labelledby="suggested-for-you-title">
      <header className={styles.header}>
        <h2 id="suggested-for-you-title" className={styles.title}>
          {t("title")}
        </h2>
        <p className={styles.subtitle}>{t(subtitleKey)}</p>
      </header>

      <div className={styles.grid}>
        {resolved.rows.map(({ offering, seller }) => (
          <OfferingCard
            key={offering.id}
            offering={offering}
            seller={seller}
          />
        ))}
      </div>

      {showExploreMore ? (
        <div className={styles.actions}>
          <Button
            href={exploreHref}
            variant="ghost"
            size="default"
            className={styles.exploreButton}
          >
            {t("exploreMore")}
          </Button>
        </div>
      ) : null}
    </section>
  );
}

export default SuggestedForYou;
