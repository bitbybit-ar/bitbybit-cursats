"use client";

import { useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/routing";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import styles from "./notifications-form.module.scss";

/**
 * Notification kinds the user can toggle. Mirrors the union in
 * `lib/schemas/notifications.ts` — keep in sync. New kinds added
 * server-side default to ON until the user explicitly disables
 * them here (consistent with arena's missing-key-means-enabled
 * convention).
 */
const NOTIFICATION_KINDS = ["order.paid", "sale.received"] as const;
type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

/**
 * next-intl forbids "." inside message keys (it's the nesting
 * separator). The notification-kind values are an external contract
 * — the `users.notification_prefs` jsonb keys, the
 * `notificationKindSchema` enum, and what the Wapu webhook emits —
 * so they keep their dots. Only the i18n lookup maps to a dot-free
 * token; the persisted prefs payload still uses the kind itself.
 */
const KIND_I18N_TOKEN: Record<NotificationKind, string> = {
  "order.paid": "orderPaid",
  "sale.received": "saleReceived",
};

interface NotificationsFormProps {
  initialPrefs: Record<string, boolean>;
}

export function NotificationsForm({ initialPrefs }: NotificationsFormProps) {
  const t = useTranslations("settings.notifications");
  const tErr = useTranslations("errors");
  const router = useRouter();
  const { showToast } = useToast();

  // `true` means enabled; missing or non-`false` defaults to enabled.
  // We coerce to a fully-populated object on mount so each toggle
  // has a determinate state — easier than threading optional booleans.
  const [prefs, setPrefs] = useState<Record<NotificationKind, boolean>>(() => {
    const out = {} as Record<NotificationKind, boolean>;
    for (const k of NOTIFICATION_KINDS) {
      out[k] = initialPrefs[k] !== false;
    }
    return out;
  });
  const [isPending, setIsPending] = useState(false);

  function toggle(kind: NotificationKind) {
    setPrefs((prev) => ({ ...prev, [kind]: !prev[kind] }));
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (isPending) return;
    setIsPending(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ notification_prefs: prefs }),
      });
      if (!res.ok) {
        showToast(t("saveFailed"), "error");
        return;
      }
      showToast(t("saved"), "success");
      router.refresh();
    } catch {
      showToast(tErr("network"), "error");
    } finally {
      setIsPending(false);
    }
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <section className={styles.section}>
        <header className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>{t("title")}</h2>
          <p className={styles.sectionHint}>{t("hint")}</p>
        </header>

        <ul className={styles.list}>
          {NOTIFICATION_KINDS.map((kind) => {
            const token = KIND_I18N_TOKEN[kind];
            return (
              <li key={kind} className={styles.row}>
                <div className={styles.rowMain}>
                  <strong>{t(`kind.${token}.title`)}</strong>
                  <span className={styles.rowHint}>
                    {t(`kind.${token}.hint`)}
                  </span>
                </div>
                <label className={styles.toggle}>
                  <input
                    type="checkbox"
                    checked={prefs[kind]}
                    onChange={() => toggle(kind)}
                    aria-label={t(`kind.${token}.title`)}
                  />
                  <span className={styles.toggleVisual} aria-hidden="true" />
                </label>
              </li>
            );
          })}
        </ul>
      </section>

      <div className={styles.actions}>
        <Button type="submit" variant="primary" disabled={isPending}>
          {isPending ? t("saving") : t("save")}
        </Button>
      </div>
    </form>
  );
}

export default NotificationsForm;
