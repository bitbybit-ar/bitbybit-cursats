"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { KeyIcon } from "@/components/icons";
import { CodePoolModal } from "@/components/courses/code-pool-modal";
import styles from "./code-pool-section.module.scss";

interface CodePoolSectionProps {
  offeringId: string;
  offeringSlug: string;
  initialRemaining: number;
}

/**
 * Edit-page entry point to the redemption-code manager. The codes UI
 * itself lives in a modal ({@link CodePoolModal}); this renders the
 * trigger and the available-count summary inline on the form page.
 */
export function CodePoolSection({
  offeringId,
  offeringSlug,
  initialRemaining,
}: CodePoolSectionProps) {
  const t = useTranslations("myCourses.codePool");
  const [open, setOpen] = useState(false);

  return (
    <div className={styles.section}>
      <p className={styles.summary}>{t("remaining", { count: initialRemaining })}</p>
      <Button type="button" variant="secondary" onClick={() => setOpen(true)}>
        <KeyIcon size={16} />
        {t("manageCta")}
      </Button>

      {open ? (
        <CodePoolModal
          offeringId={offeringId}
          offeringSlug={offeringSlug}
          initialRemaining={initialRemaining}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </div>
  );
}

export default CodePoolSection;
