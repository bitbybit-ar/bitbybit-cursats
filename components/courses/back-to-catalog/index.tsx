"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { ArrowLeftIcon } from "@/components/icons";
import styles from "./back-to-catalog.module.scss";

/**
 * Shared "Back to catalog" link that returns to /my-courses. Used at
 * the top of the create-course, edit-course, and orders pages so the
 * creator surfaces share one back affordance.
 */
export function BackToCatalog() {
  const t = useTranslations("common");
  return (
    <Link href="/my-courses" className={styles.back}>
      <ArrowLeftIcon size={16} />
      {t("backToCatalog")}
    </Link>
  );
}

export default BackToCatalog;
