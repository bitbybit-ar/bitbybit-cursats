import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "@/i18n/routing";
import { getSession } from "@/lib/auth";
import { getUserByPubkey } from "@/lib/creator/users";
import { alternatesFor } from "@/lib/seo";
import { SignInClient } from "./signin-client";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "login" });
  return {
    title: t("metadataTitle"),
    // Keep the sign-in page out of search results; it has no
    // standalone informational value and no canonical content.
    robots: { index: false, follow: true },
    alternates: alternatesFor(locale, "/sign-in"),
  };
}

export default async function SignInPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ next?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await getSession();
  if (session) {
    // Already signed in — bounce to the next path (validated
    // client-side too, but the server-side call honors the same
    // whitelist) or to the order history default. Honor the stored
    // language preference (ADR 0021) over the URL locale: the row is
    // the source of truth and may be newer than the session JWT (a
    // /settings change doesn't re-mint the cookie).
    const { next } = await searchParams;
    const user = await getUserByPubkey(session.pubkey);
    const preferred =
      user?.locale === "en" || user?.locale === "es"
        ? user.locale
        : session.locale;
    redirect({ href: safeNext(next), locale: preferred });
  }

  return <SignInClient locale={locale === "en" ? "en" : "es"} />;
}

const ALLOWED_NEXT_PREFIXES = [
  "/purchases",
  "/my-courses",
  "/create-course",
  "/orders",
  "/settings",
  "/claim/",
  "/receipt/",
];

function safeNext(raw: string | undefined): string {
  if (!raw) return "/purchases";
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("..")) {
    return "/purchases";
  }
  if (ALLOWED_NEXT_PREFIXES.some((p) => raw.startsWith(p))) return raw;
  return "/purchases";
}
