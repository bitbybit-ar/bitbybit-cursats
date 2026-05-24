import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { Container } from "@/components/ui/container";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * Shared layout for the logged-in surfaces (settings, my-courses,
 * create-course, orders, purchases). Two responsibilities:
 *
 *   1. Defense-in-depth auth gate. The edge proxy already bounces
 *      unauthenticated visitors to /sign-in; this layout 404s as a
 *      backstop in case the proxy is misconfigured.
 *   2. Common page chrome (Container) so each page can render its
 *      own header + body without re-stacking the same wrapper.
 *      Pages may add their own <Section>s inside Container when
 *      they want visible section banding — the layout does not
 *      assume one.
 *
 * Each page still calls `requirePageUser()` (or `requireUser()`
 * on the API side) to scope its DB queries to the user's row —
 * the layout intentionally does not propagate that down via
 * context to keep the data path uniform with the API routes.
 */
export default async function LoggedInLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await getSession();
  if (!session) notFound();

  return <Container>{children}</Container>;
}
