import type { Metadata } from "next";
import { routing } from "@/i18n/routing";

const SITE_NAME = "CURSATS";

export function localizedPath(locale: string, path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  if (locale === routing.defaultLocale) {
    return normalized;
  }
  return normalized === "/" ? `/${locale}` : `/${locale}${normalized}`;
}

export function alternatesFor(
  locale: string,
  path: string
): { canonical: string; languages: Record<string, string> } {
  return {
    canonical: localizedPath(locale, path),
    languages: Object.fromEntries(
      routing.locales.map((l) => [l, localizedPath(l, path)])
    ),
  };
}

// The brand social card, shared by every page. The localized dynamic
// `opengraph-image` route is primary — it renders the per-locale value
// line in real brand type — and the static `/og.png` twin is a
// fallback for crawlers that can't render the dynamic endpoint. Both
// are resolved against `metadataBase` (set in the locale layout). The
// `opengraph-image` file convention lives at the `[locale]` segment,
// so the default locale serves it unprefixed and `en` carries `/en`.
type OgImage = { url: string; width?: number; height?: number; alt: string };

function sharedOgImages(locale: string, alt: string): OgImage[] {
  const dynamicPath =
    locale === routing.defaultLocale
      ? "/opengraph-image"
      : `/${locale}/opengraph-image`;
  return [
    { url: dynamicPath, width: 1200, height: 630, alt },
    { url: "/og.png", width: 1200, height: 630, alt },
  ];
}

/**
 * Build a page's metadata so every route carries the same brand social
 * image with its own title and description.
 *
 * Why a shared builder: the dynamic `opengraph-image` file convention
 * does not propagate to nested route segments, and a page that sets
 * its own `openGraph` block drops the inherited image entirely — so
 * nested pages either showed no card image or reused the home page's
 * title/description. This builder always emits the full
 * `openGraph`/`twitter` triple (brand image + per-page title +
 * description), keeping the card consistent everywhere.
 *
 * `title` is the document title; the locale layout's title template
 * appends "· CURSATS". `socialTitle` is what shows on the share card
 * and defaults to "CURSATS — <title>" so cards stay brand-led and
 * distinct per page; pass it explicitly when the page title already
 * reads well on its own (e.g. a creator store or an offering).
 *
 * `image` is an optional page-specific card image (a course image or
 * a creator banner): when set it leads the `og:image` list so the
 * share card previews that content, with the brand card kept after it
 * as a fallback for crawlers that fail to fetch the custom one.
 */
export function buildPageMetadata({
  locale,
  path,
  title,
  description,
  socialTitle,
  robots,
  image,
}: {
  locale: string;
  path: string;
  title: string;
  description?: string;
  socialTitle?: string;
  robots?: Metadata["robots"];
  image?: { url: string; alt?: string };
}): Metadata {
  const ogTitle = socialTitle ?? `${SITE_NAME} — ${title}`;
  const brandImages = sharedOgImages(locale, ogTitle);
  const images: OgImage[] = image
    ? [{ url: image.url, alt: image.alt ?? ogTitle }, ...brandImages]
    : brandImages;
  const ogLocale = locale === "es" ? "es_AR" : "en_US";
  const altLocale = locale === "es" ? "en_US" : "es_AR";

  return {
    title,
    ...(description ? { description } : {}),
    alternates: alternatesFor(locale, path),
    ...(robots ? { robots } : {}),
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      title: ogTitle,
      ...(description ? { description } : {}),
      url: localizedPath(locale, path),
      locale: ogLocale,
      alternateLocale: altLocale,
      images,
    },
    twitter: {
      card: "summary_large_image",
      title: ogTitle,
      ...(description ? { description } : {}),
      images: images.map((image) => image.url),
    },
  };
}
