"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { useRouter } from "@/i18n/routing";
import styles from "./code-pool-modal.module.scss";

interface CodePoolModalProps {
  offeringId: string;
  offeringSlug: string;
  initialRemaining: number;
  onClose: () => void;
}

/**
 * Redemption-code management surface for type=code offerings, shown in
 * a modal so it can open from both the edit page and the My courses
 * kebab menu. Two affordances: mint additional codes
 * (`POST /api/my-courses/[id]/mint-codes`) and download the unused
 * pool as CSV. A mint does not require re-submitting the offering
 * form, and lands a distinct "mint_codes" audit row.
 */
export function CodePoolModal({
  offeringId,
  offeringSlug,
  initialRemaining,
  onClose,
}: CodePoolModalProps) {
  const t = useTranslations("myCourses.codePool");
  const tErr = useTranslations("errors");
  const router = useRouter();
  const { showToast } = useToast();

  const [remaining, setRemaining] = useState(initialRemaining);
  const [mintCount, setMintCount] = useState("10");
  const [isMinting, setIsMinting] = useState(false);

  async function handleMint() {
    if (isMinting) return;
    const count = Number.parseInt(mintCount, 10);
    if (Number.isNaN(count) || count <= 0 || count > 10_000) {
      showToast(t("invalidCount"), "error");
      return;
    }

    setIsMinting(true);
    try {
      const res = await fetch(`/api/my-courses/${offeringId}/mint-codes`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ count }),
      });
      if (!res.ok) {
        showToast(t("mintFailed"), "error");
        return;
      }
      const data = (await res.json()) as { pool_size: number };
      setRemaining(data.pool_size);
      showToast(t("mintSuccess", { count }), "success");
      router.refresh();
    } catch {
      showToast(tErr("network"), "error");
    } finally {
      setIsMinting(false);
    }
  }

  return (
    <Modal onClose={onClose} title={t("title")} size="md">
      <p className={styles.subtitle}>{t("remaining", { count: remaining })}</p>

      <div className={styles.row}>
        <div className={styles.field}>
          <label htmlFor="mintCount" className={styles.label}>
            {t("mintCountLabel")}
          </label>
          <input
            id="mintCount"
            type="number"
            min={1}
            max={10000}
            step={1}
            className={styles.input}
            value={mintCount}
            onChange={(e) => setMintCount(e.target.value)}
          />
        </div>
        <Button
          type="button"
          variant="primary"
          onClick={handleMint}
          disabled={isMinting}
        >
          {isMinting ? t("minting") : t("mintCta")}
        </Button>
      </div>

      <a
        href={`/api/my-courses/${offeringId}/codes`}
        download={`${offeringSlug}-codes.csv`}
        className={styles.download}
      >
        {t("downloadCsv")}
      </a>
    </Modal>
  );
}

export default CodePoolModal;
