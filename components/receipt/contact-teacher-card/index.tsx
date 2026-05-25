import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { Card } from "@/components/ui/card";
import { UserIcon, ArrowRightIcon } from "@/components/icons";
import styles from "./contact-teacher-card.module.scss";

interface ContactTeacherCardProps {
  /** Seller display name, woven into the body + CTA copy. */
  teacherName: string;
  /**
   * Where the buyer goes to redeem the code / reach the teacher.
   * Usually the offering's `redeem_url`; falls back to the seller's
   * storefront for legacy code offerings that predate that field.
   */
  href: string;
  /**
   * True when `href` is an off-site URL (a redeem_url). Renders a
   * plain anchor opening in a new tab; false renders the locale-aware
   * internal storefront link.
   */
  isExternal: boolean;
}

export function ContactTeacherCard({
  teacherName,
  href,
  isExternal,
}: ContactTeacherCardProps) {
  const t = useTranslations("receipt.contactTeacher");

  const cta = (
    <>
      {t("cta", { teacherName })} <ArrowRightIcon size={16} />
    </>
  );

  return (
    <Card variant="default" className={styles.card}>
      <div className={styles.iconWrap} aria-hidden>
        <UserIcon size={28} />
      </div>
      <div className={styles.body}>
        <h3 className={styles.title}>{t("title")}</h3>
        <p className={styles.text}>{t("body", { teacherName })}</p>
      </div>
      {isExternal ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className={styles.cta}
        >
          {cta}
        </a>
      ) : (
        <Link href={href} className={styles.cta}>
          {cta}
        </Link>
      )}
    </Card>
  );
}

export default ContactTeacherCard;
