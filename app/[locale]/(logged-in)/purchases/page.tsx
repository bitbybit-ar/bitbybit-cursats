import type { Metadata } from "next";
import Image from "next/image";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect, Link } from "@/i18n/routing";
import { Card } from "@/components/ui/card";
import { ArrowRightIcon, UserIcon } from "@/components/icons";
import { Pager } from "@/components/catalog/explore-pager";
import { SuggestedForYou } from "@/components/catalog/suggested-for-you";
import { PurchasesSearch } from "@/components/account/purchases-search";
import { getSession } from "@/lib/auth";
import { alternatesFor } from "@/lib/seo";
import { listPurchasesPaged } from "@/lib/orders";
import {
  PURCHASES_PAGE_SIZE,
  buildPurchasesHref,
  parsePurchasesParams,
  purchasesHasActiveFilters,
  type PurchasesStatusFilter,
} from "@/lib/purchases-params";
import styles from "./page.module.scss";

export const dynamic = "force-dynamic";

const STATUS_TABS: PurchasesStatusFilter[] = [
  "all",
  "paid",
  "pending",
  "failed",
];

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "account" });
  return {
    title: t("metadataTitle"),
    robots: { index: false, follow: true },
    alternates: alternatesFor(locale, "/purchases"),
  };
}

export default async function PurchasesPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await getSession();
  if (!session) {
    redirect({ href: "/sign-in?next=/purchases", locale });
    return null;
  }

  const sp = await searchParams;
  const parsed = parsePurchasesParams(sp);

  const t = await getTranslations("account");
  const tStatus = await getTranslations("orderStatus");

  const { rows, total } = await listPurchasesPaged({
    pubkey: session.pubkey,
    status: parsed.status === "all" ? undefined : parsed.status,
    q: parsed.q || undefined,
    page: parsed.page,
    pageSize: PURCHASES_PAGE_SIZE,
  });

  const totalPages = Math.max(1, Math.ceil(total / PURCHASES_PAGE_SIZE));
  const isFiltered = purchasesHasActiveFilters(parsed);
  const isAbsolutelyEmpty = total === 0 && parsed.page === 1 && !isFiltered;

  const dateFormatter = new Intl.DateTimeFormat(
    locale === "es" ? "es-AR" : "en-US",
    { dateStyle: "medium" }
  );
  const numberFormatter = new Intl.NumberFormat(
    locale === "es" ? "es-AR" : "en-US"
  );

  // The empty-state suggestions rail has nothing to exclude; for
  // the populated rail we pass the offering ids already in view so
  // the rail does not re-surface a course the buyer just scrolled
  // past in their history.
  const populatedExcludeIds = rows.map((r) => r.offering.id);

  if (isAbsolutelyEmpty) {
    return (
      <>
        <header className={styles.header}>
          <div>
            <h1 className={styles.title}>{t("title")}</h1>
            <p className={styles.subtitle}>{t("subtitle")}</p>
          </div>
        </header>

        <Card variant="default" className={styles.emptyHero}>
          <h2 className={styles.emptyHeroTitle}>{t("emptyHero.title")}</h2>
          <p className={styles.emptyHeroBody}>{t("emptyHero.body")}</p>
        </Card>

        <SuggestedForYou pubkey={session.pubkey} />
      </>
    );
  }

  return (
    <>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>{t("title")}</h1>
          <p className={styles.subtitle}>{t("subtitle")}</p>
        </div>
      </header>

      <div className={styles.controls}>
        <nav className={styles.tabs} aria-label={t("filtersLabel")}>
          {STATUS_TABS.map((tab) => {
            const isActive = parsed.status === tab;
            const href = buildPurchasesHref(parsed, { status: tab, page: 1 });
            return (
              <Link
                key={tab}
                href={href}
                className={`${styles.tab} ${isActive ? styles.tabActive : ""}`}
                aria-current={isActive ? "page" : undefined}
              >
                {t(`filters.${tab}`)}
              </Link>
            );
          })}
        </nav>
        <PurchasesSearch current={parsed} />
      </div>

      {rows.length === 0 ? (
        <Card variant="default" className={styles.noMatches}>
          <p>{t("noMatches")}</p>
        </Card>
      ) : (
        <ul className={styles.list}>
          {rows.map((row) => {
            const { order, offering, seller } = row;
            const isPaid = order.status === "paid";
            const isPending = order.status === "pending";
            const offeringHref = `/${seller.slug}/c/${offering.slug}`;
            const receiptHref = `/receipt/${order.id}`;
            const checkoutHref = `/checkout/${order.id}`;
            return (
              <li key={order.id} className={styles.item}>
                <Card variant="hover" className={styles.row}>
                  <Link
                    href={isPending ? checkoutHref : receiptHref}
                    className={styles.thumbLink}
                    aria-label={offering.title}
                  >
                    <div className={styles.thumb}>
                      {offering.image_url ? (
                        <Image
                          src={offering.image_url}
                          alt=""
                          fill
                          sizes="56px"
                          className={styles.thumbImg}
                        />
                      ) : (
                        <span
                          aria-hidden="true"
                          className={styles.thumbFallback}
                        >
                          {offering.title.slice(0, 1).toUpperCase()}
                        </span>
                      )}
                    </div>
                  </Link>

                  <div className={styles.rowMain}>
                    <h2 className={styles.rowTitle}>
                      <Link
                        href={isPending ? checkoutHref : receiptHref}
                        className={styles.rowTitleLink}
                      >
                        {offering.title}
                      </Link>
                    </h2>
                    <Link href={`/${seller.slug}`} className={styles.byline}>
                      <span className={styles.avatar} aria-hidden="true">
                        {seller.avatar_url ? (
                          <Image
                            src={seller.avatar_url}
                            alt=""
                            width={20}
                            height={20}
                            className={styles.avatarImg}
                          />
                        ) : (
                          <UserIcon size={12} />
                        )}
                      </span>
                      <span className={styles.bylineName}>
                        {seller.display_name}
                      </span>
                    </Link>
                    <p className={styles.rowMeta}>
                      <span>{dateFormatter.format(order.created_at)}</span>
                      <span aria-hidden="true">·</span>
                      <span>
                        {numberFormatter.format(order.amount_sats)} sats
                      </span>
                    </p>
                  </div>

                  {isPaid ? (
                    <Link
                      href={receiptHref}
                      aria-label={t("viewReceipt")}
                      className={`${styles.status} ${
                        styles[`status-${order.status}`]
                      }`}
                    >
                      {tStatus(order.status)}
                    </Link>
                  ) : (
                    <span
                      className={`${styles.status} ${
                        styles[`status-${order.status}`]
                      }`}
                    >
                      {tStatus(order.status)}
                    </span>
                  )}

                  <div className={styles.actions}>
                    {isPending ? (
                      <Link
                        href={checkoutHref}
                        className={styles.actionPrimary}
                      >
                        {t("continueCheckout")} <ArrowRightIcon size={14} />
                      </Link>
                    ) : isPaid ? null : (
                      <Link href={receiptHref} className={styles.actionPrimary}>
                        {t("viewReceipt")} <ArrowRightIcon size={14} />
                      </Link>
                    )}
                    <Link
                      href={offeringHref}
                      className={styles.actionSecondary}
                    >
                      {t("viewListing")}
                    </Link>
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      {total > PURCHASES_PAGE_SIZE && (
        <Pager
          page={parsed.page}
          totalPages={totalPages}
          prevHref={
            parsed.page > 1
              ? buildPurchasesHref(parsed, { page: parsed.page - 1 })
              : null
          }
          nextHref={
            parsed.page < totalPages
              ? buildPurchasesHref(parsed, { page: parsed.page + 1 })
              : null
          }
        />
      )}

      <SuggestedForYou
        pubkey={session.pubkey}
        excludeOfferingIds={populatedExcludeIds}
      />
    </>
  );
}
