import { useFormatter, useTranslations } from "next-intl";
import { ExternalLinkIcon } from "@/components/icons";
import styles from "./receipt-download.module.scss";

interface ReceiptDownloadProps {
  orderId: string;
  /**
   * Whether the offering has a download URL on file. When false,
   * the component renders the "missing" pending state instead of a
   * dead link. The actual URL lives on the offering and never
   * reaches the client; the proxy at `/api/downloads/[orderId]`
   * resolves it after re-checking access.
   */
  isAvailable: boolean;
  /** Downloads still available on this order (cap minus used). */
  remaining: number;
  /** True once the post-payment download window has elapsed. */
  expired: boolean;
  /** ISO date the link stops working, or null when not yet paid. */
  expiresAtIso: string | null;
}

export function ReceiptDownload({
  orderId,
  isAvailable,
  remaining,
  expired,
  expiresAtIso,
}: ReceiptDownloadProps) {
  const t = useTranslations("receipt.download");
  const format = useFormatter();

  if (!isAvailable) {
    return (
      <div className={styles.box}>
        <p className={styles.label}>{t("label")}</p>
        <p className={styles.missing}>{t("missing")}</p>
      </div>
    );
  }

  // The link is spent once the window elapsed or the per-order cap is
  // reached; show why instead of a button that 410s.
  if (expired || remaining <= 0) {
    return (
      <div className={styles.box}>
        <p className={styles.label}>{t("label")}</p>
        <p className={styles.missing}>{t("exhausted")}</p>
      </div>
    );
  }

  // Anchor (not the shared Button) because the proxy URL lives
  // outside next-intl's locale-aware Link routing; the Button
  // component would try to localise the href.
  return (
    <div className={styles.box}>
      <p className={styles.label}>{t("label")}</p>
      <a
        href={`/api/downloads/${orderId}`}
        target="_blank"
        rel="noopener noreferrer"
        className={styles.cta}
      >
        <ExternalLinkIcon size={18} />
        {t("cta")}
      </a>
      <p className={styles.meta}>
        {t("remaining", { count: remaining })}
        {expiresAtIso
          ? ` · ${t("availableUntil", {
              date: format.dateTime(new Date(expiresAtIso), {
                dateStyle: "medium",
              }),
            })}`
          : ""}
      </p>
    </div>
  );
}

export default ReceiptDownload;
