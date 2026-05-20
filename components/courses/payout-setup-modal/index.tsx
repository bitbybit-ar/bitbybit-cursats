"use client";

import { useTranslations } from "next-intl";
import { Modal } from "@/components/ui/modal";
import { PayoutForm } from "@/components/settings/payout-form";
import styles from "./payout-setup-modal.module.scss";

type PayoutMethod = "cbu_alias" | "lightning_address";

export interface PayoutSavedValues {
  cbu: string;
  alias: string;
  payoutMethod: PayoutMethod;
}

interface PayoutSetupModalProps {
  initialCbu: string;
  initialAlias: string;
  initialPayoutMethod: PayoutMethod;
  currentLightningAddress: string;
  onSaved: (next: PayoutSavedValues) => void;
  onClose: () => void;
}

/**
 * Gate modal opened from the create-course form when the seller has
 * no payout destination configured yet. Embeds the same PayoutForm
 * used in /settings so a save here writes through to the canonical
 * `users` row; on success the parent form resumes its submission with
 * the freshly-saved values.
 */
export function PayoutSetupModal({
  initialCbu,
  initialAlias,
  initialPayoutMethod,
  currentLightningAddress,
  onSaved,
  onClose,
}: PayoutSetupModalProps) {
  const t = useTranslations("createCourse.payoutModal");

  return (
    <Modal onClose={onClose} title={t("title")} size="md">
      <p className={styles.intro}>{t("intro")}</p>
      <PayoutForm
        initialCbu={initialCbu}
        initialAlias={initialAlias}
        initialPayoutMethod={initialPayoutMethod}
        currentLightningAddress={currentLightningAddress}
        onSaved={onSaved}
      />
    </Modal>
  );
}

export default PayoutSetupModal;
