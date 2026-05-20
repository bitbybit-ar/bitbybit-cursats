"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/routing";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { useSignerContext } from "@/lib/contexts/signer-context";
import {
  buildSettingsAuthEvent,
  hashSettingsBody,
} from "@/lib/admin/sign-settings-payload";
import { isSignerCancellation } from "@/lib/nostr/auth-errors";
import styles from "./danger-zone-form.module.scss";

/**
 * Soft-delete the current account (ADR 0021). Confirmation modal
 * + NIP-98 re-sign so a stolen session cookie can't take the
 * account out from under the rightful owner.
 *
 * Cursats keeps the row instead of hard-deleting; offerings,
 * orders, and audit-log entries keep their foreign keys intact.
 * The seller's storefront stops appearing in discovery because
 * `users.active = false` already filters them out.
 */
export function DangerZoneForm() {
  const t = useTranslations("settings.danger");
  const tErr = useTranslations("errors");
  const router = useRouter();
  const { showToast } = useToast();
  const { signWithPrompt, signOut } = useSignerContext();

  const [open, setOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  async function handleDelete() {
    if (isDeleting) return;
    setIsDeleting(true);
    try {
      const url = new URL("/api/settings", window.location.origin).toString();
      // DELETE has no body — sign the empty-body hash so the server
      // can verify with the same payload-hash check it uses on PATCH.
      const payloadHash = await hashSettingsBody("");
      const unsigned = buildSettingsAuthEvent(url, payloadHash, {
        method: "DELETE",
      });
      let signed;
      try {
        signed = await signWithPrompt(unsigned);
      } catch (err) {
        if (
          isSignerCancellation(err) ||
          (err instanceof Error && err.message === "re_sign_in_cancelled")
        ) {
          showToast(t("signCancelled"), "info");
          return;
        }
        showToast(t("deleteFailed"), "error");
        return;
      }
      const res = await fetch("/api/settings", {
        method: "DELETE",
        headers: {
          Authorization: `Nostr ${btoa(JSON.stringify(signed))}`,
        },
      });
      if (!res.ok) {
        showToast(t("deleteFailed"), "error");
        return;
      }
      // Clear the in-memory signer + session state, then bounce home.
      await signOut().catch(() => {});
      showToast(t("deleted"), "success");
      router.push("/");
    } catch {
      showToast(tErr("network"), "error");
    } finally {
      setIsDeleting(false);
      setOpen(false);
    }
  }

  return (
    <>
      <section className={styles.section}>
        <header className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>{t("title")}</h2>
          <p className={styles.sectionHint}>{t("hint")}</p>
        </header>

        <div className={styles.row}>
          <div className={styles.rowMain}>
            <strong>{t("deleteAccount")}</strong>
            <span className={styles.rowHint}>{t("deleteAccountHint")}</span>
          </div>
          <Button
            type="button"
            variant="danger"
            onClick={() => setOpen(true)}
            disabled={isDeleting}
          >
            {t("deleteAccountCta")}
          </Button>
        </div>
      </section>

      {open ? (
        <Modal onClose={() => setOpen(false)} title={t("modalTitle")} size="sm">
          <p className={styles.modalBody}>{t("modalBody")}</p>
          <ul className={styles.modalList}>
            <li>{t("modalBullets.profile")}</li>
            <li>{t("modalBullets.offerings")}</li>
            <li>{t("modalBullets.history")}</li>
          </ul>
          <div className={styles.modalActions}>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setOpen(false)}
              disabled={isDeleting}
            >
              {t("modalCancel")}
            </Button>
            <Button
              type="button"
              variant="danger"
              onClick={handleDelete}
              disabled={isDeleting}
            >
              {isDeleting ? t("modalConfirming") : t("modalConfirm")}
            </Button>
          </div>
        </Modal>
      ) : null}
    </>
  );
}

export default DangerZoneForm;
