import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import {
  getMessages,
  getTranslations,
  setRequestLocale,
} from "next-intl/server";
import { Nunito, Nunito_Sans } from "next/font/google";
import { routing } from "@/i18n/routing";
import { alternatesFor } from "@/lib/seo";
import { serializeJsonLd } from "@/lib/jsonld";
import { getBaseUrl } from "@/lib/env";
import { cn } from "@/lib/utils";
import { ThemeProvider } from "@/lib/contexts/theme-context";
import { SignerProviderClient } from "@/components/auth/signer-provider-client";
import type { SessionUser } from "@/lib/contexts/signer-context";
import { getSession } from "@/lib/auth";
import { getUserByPubkey } from "@/lib/creator/users";
import { ToastProvider } from "@/components/ui/toast";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import "@/styles/globals.scss";

/**
 * Build the SessionUser shape the SignerProvider expects from the
 * request cookie. Mirrors the `/api/auth/session` route's payload so
 * the navbar and the API agree on the same picture of the session.
 * Returns `null` when the cookie is missing or the JWT no longer
 * verifies — letting the provider boot with `session: null` instead
 * of a stale truthy value.
 */
async function resolveInitialSession(): Promise<SessionUser | null> {
  const session = await getSession();
  if (!session) return null;
  const user = await getUserByPubkey(session.pubkey);
  return {
    pubkey: session.pubkey,
    locale: session.locale,
    signer_type: session.signer_type,
    user:
      user && user.active
        ? {
            id: user.id,
            slug: user.slug,
            display_name: user.display_name,
          }
        : null,
  };
}

const nunito = Nunito({
  subsets: ["latin"],
  weight: ["700", "800"],
  variable: "--font-display",
  display: "swap",
});

const nunitoSans = Nunito_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-body",
  display: "swap",
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "metadata" });
  const baseUrl = getBaseUrl();
  const ogLocale = locale === "es" ? "es_AR" : "en_US";
  const altLocale = locale === "es" ? "en_US" : "es_AR";

  return {
    metadataBase: new URL(baseUrl),
    title: {
      default: t("siteTitle"),
      template: `%s · ${t("siteName")}`,
    },
    description: t("description"),
    keywords: t("keywords").split(","),
    authors: [{ name: "BitByBit", url: "https://github.com/bitbybit-ar" }],
    creator: "BitByBit",
    publisher: "BitByBit",
    applicationName: t("siteName"),
    category: "finance",
    alternates: alternatesFor(locale, "/"),
    openGraph: {
      type: "website",
      siteName: t("siteName"),
      title: t("siteTitle"),
      description: t("description"),
      url: locale === "es" ? baseUrl : `${baseUrl}/${locale}`,
      locale: ogLocale,
      alternateLocale: altLocale,
      // Static PNG referenced explicitly so WhatsApp's link-preview
      // crawler (which historically misses Next.js file-convention
      // OG endpoints) has a guaranteed image to fetch. The dynamic
      // `opengraph-image.tsx` in this segment still auto-injects as
      // a second entry — crawlers that respect file conventions get
      // the per-locale headline; those that don't get the static one.
      images: [
        {
          url: "/og.png",
          width: 1200,
          height: 630,
          alt: t("siteTitle"),
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: t("siteTitle"),
      description: t("description"),
      images: ["/og.png"],
    },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        "max-video-preview": -1,
        "max-image-preview": "large",
        "max-snippet": -1,
      },
    },
  };
}

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const messages = await getMessages();
  const t = await getTranslations({ locale, namespace: "metadata" });
  const baseUrl = getBaseUrl();
  const initialSession = await resolveInitialSession();

  const orgJsonLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "BitByBit Cursats",
    alternateName: "Cursats",
    url: baseUrl,
    logo: `${baseUrl}/icons/icon.svg`,
    description: t("description"),
    foundingLocation: {
      "@type": "Country",
      name: "Argentina",
    },
    parentOrganization: {
      "@type": "Organization",
      name: "BitByBit",
      url: "https://bitbybit.com.ar",
      sameAs: ["https://github.com/bitbybit-ar"],
    },
    sameAs: ["https://github.com/bitbybit-ar/bitbybit-cursats"],
  };

  const websiteJsonLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: t("siteName"),
    url: baseUrl,
    inLanguage: routing.locales,
  };

  return (
    <html
      lang={locale}
      className={cn(nunito.variable, nunitoSans.variable)}
      suppressHydrationWarning
    >
      <head>
        <link rel="icon" href="/icons/icon.svg" type="image/svg+xml" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: serializeJsonLd(orgJsonLd) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: serializeJsonLd(websiteJsonLd) }}
        />
      </head>
      <body suppressHydrationWarning>
        <NextIntlClientProvider messages={messages}>
          <ThemeProvider>
            <SignerProviderClient initialSession={initialSession}>
              <ToastProvider>
                <a href="#main" className="skip-link">
                  {t("skipToContent")}
                </a>
                <Navbar />
                <main id="main">{children}</main>
                <Footer />
              </ToastProvider>
            </SignerProviderClient>
          </ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
