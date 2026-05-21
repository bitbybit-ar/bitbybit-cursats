import Image from "next/image";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { Card } from "@/components/ui/card";
import { ArrowRightIcon, UserIcon } from "@/components/icons";
import { PriceTag } from "@/components/catalog/price-tag";
import type { Offering } from "@/lib/offerings";
import styles from "./offering-card.module.scss";

interface SellerCard {
  slug: string;
  display_name: string;
  avatar_url?: string | null;
}

interface OfferingCardProps {
  offering: Offering;
  /**
   * The owning seller. Required so the card links to the seller-
   * scoped detail URL `/[uslug]/c/[oslug]` and renders the
   * seller's display name on the card.
   */
  seller: SellerCard;
  /**
   * When `true`, hide the seller byline. Use on a single seller's
   * storefront (`/[slug]`), where the page hero already names them.
   */
  hideSeller?: boolean;
}

export function OfferingCard({
  offering,
  seller,
  hideSeller = false,
}: OfferingCardProps) {
  const t = useTranslations("catalog.card");
  const tType = useTranslations("offering.type");
  const tOffering = useTranslations("offering");

  const offeringHref = `/${seller.slug}/c/${offering.slug}`;
  const sellerHref = `/${seller.slug}`;
  const isSoldOut =
    offering.type === "code" && (offering.code_pool?.length ?? 0) === 0;

  return (
    <Card variant="hover" className={styles.card}>
      {offering.image_url ? (
        <Link href={offeringHref} className={styles.imageLink}>
          <div className={styles.imageWrap}>
            <Image
              src={offering.image_url}
              alt={offering.title}
              fill
              sizes="(max-width: 768px) 100vw, 360px"
              className={styles.image}
            />
            {isSoldOut ? (
              <span className={styles.soldOutBadge}>
                {tOffering("soldOutBadge")}
              </span>
            ) : null}
          </div>
        </Link>
      ) : null}

      <div className={styles.body}>
        {/*
          Inline sold-out pill so legacy rows without a cover image
          still surface the state. Hidden when there's an image,
          because the image overlay above already carries the chip.
        */}
        {isSoldOut && !offering.image_url ? (
          <span className={styles.soldOutInline}>
            {tOffering("soldOutBadge")}
          </span>
        ) : null}
        <h3 className={styles.title}>
          <Link href={offeringHref} className={styles.titleLink}>
            {offering.title}
          </Link>
        </h3>
        {hideSeller ? null : (
          <Link href={sellerHref} className={styles.byline}>
            <span className={styles.avatar} aria-hidden="true">
              {seller.avatar_url ? (
                <Image
                  src={seller.avatar_url}
                  alt=""
                  width={24}
                  height={24}
                  className={styles.avatarImg}
                />
              ) : (
                <UserIcon size={14} />
              )}
            </span>
            <span className={styles.bylineName}>{seller.display_name}</span>
          </Link>
        )}
        <p className={styles.description}>{offering.description}</p>
        {offering.tags && offering.tags.length > 0 ? (
          <ul className={styles.tags}>
            {offering.tags.slice(0, 3).map((tag) => (
              <li key={tag} className={styles.tagItem}>
                <Link
                  href={`/explore?q=${encodeURIComponent(tag)}`}
                  className={styles.tag}
                >
                  {tag}
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
        <p className={styles.typeLabel}>{tType(offering.type)}</p>
      </div>

      <div className={styles.footer}>
        <PriceTag
          priceAmount={offering.price_amount}
          priceCurrency={offering.price_currency}
          size="default"
        />
        <Link href={offeringHref} className={styles.cta}>
          {t("view")} <ArrowRightIcon size={16} />
        </Link>
      </div>
    </Card>
  );
}

export default OfferingCard;
