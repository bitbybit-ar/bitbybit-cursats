import type { MetadataRoute } from "next";
import { routing } from "@/i18n/routing";
import { listPublicOfferingPaths } from "@/lib/offerings";
import { languageAlternates, localizedPath } from "@/lib/seo";
import { SITE_URL } from "@/lib/site";

// Offerings come from Postgres, so the sitemap is regenerated hourly
// instead of being frozen at build time.
export const revalidate = 3600;

const STATIC_PATHS = [
  { path: "/", priority: 1 },
  { path: "/explore", priority: 0.8 },
  { path: "/how-it-works", priority: 0.7 },
  { path: "/features", priority: 0.7 },
  { path: "/faq", priority: 0.6 },
] as const;

type Entry = {
  path: string;
  priority: number;
  lastModified: Date;
  changeFrequency: "daily" | "weekly" | "monthly";
};

const absolute = (path: string): string => `${SITE_URL}${path}`;

function localizedEntries(entry: Entry): MetadataRoute.Sitemap {
  return routing.locales.map((locale) => ({
    url: absolute(localizedPath(locale, entry.path)),
    lastModified: entry.lastModified,
    changeFrequency: entry.changeFrequency,
    priority:
      locale === routing.defaultLocale
        ? entry.priority
        : Math.round(entry.priority * 80) / 100,
    alternates: { languages: languageAlternates(entry.path, absolute) },
  }));
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const offerings = await listPublicOfferingPaths();

  // A storefront is listed only when it has at least one offering,
  // matching the storefront page's own robots rule; its lastModified
  // is its newest offering edit.
  const storefronts = new Map<string, Date>();
  for (const { userSlug, updatedAt } of offerings) {
    const seen = storefronts.get(userSlug);
    if (!seen || updatedAt > seen) storefronts.set(userSlug, updatedAt);
  }

  const entries: Entry[] = [
    ...STATIC_PATHS.map(({ path, priority }) => ({
      path,
      priority,
      lastModified: now,
      changeFrequency: "monthly" as const,
    })),
    ...[...storefronts].map(([userSlug, lastModified]) => ({
      path: `/${userSlug}`,
      priority: 0.6,
      lastModified,
      changeFrequency: "weekly" as const,
    })),
    ...offerings.map(({ userSlug, offeringSlug, updatedAt }) => ({
      path: `/${userSlug}/c/${offeringSlug}`,
      priority: 0.7,
      lastModified: updatedAt,
      changeFrequency: "weekly" as const,
    })),
  ];

  return entries.flatMap(localizedEntries);
}
