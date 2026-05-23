"use client";

import { useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/routing";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import styles from "./preferences-form.module.scss";

type Locale = "es" | "en";

/**
 * Notification kinds the user can toggle. Mirrors the union in
 * `lib/schemas/notifications.ts` — keep in sync. New kinds added
 * server-side default to ON until the user explicitly disables them
 * here (consistent with arena's missing-key-means-enabled convention).
 *
 * The three `payout.*` kinds only fire for ARS (Wapu) sellers — a sale
 * lands pending, then Wapu releases (or fails) the transfer to the
 * seller's account. They're harmless toggles for sats sellers.
 */
const NOTIFICATION_KINDS = [
  "order.paid",
  "sale.received",
  "payout.pending",
  "payout.released",
  "payout.failed",
] as const;
type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

/**
 * next-intl forbids "." inside message keys (it's the nesting
 * separator). The notification-kind values are an external contract —
 * the `users.notification_prefs` jsonb keys, the
 * `notificationKindSchema` enum, and what the settlement flow emits —
 * so they keep their dots. Only the i18n lookup maps to a dot-free
 * token; the persisted prefs payload still uses the kind itself.
 */
const KIND_I18N_TOKEN: Record<NotificationKind, string> = {
  "order.paid": "orderPaid",
  "sale.received": "saleReceived",
  "payout.pending": "payoutPending",
  "payout.released": "payoutReleased",
  "payout.failed": "payoutFailed",
};

interface PreferencesFormProps {
  initialLocale: Locale;
  initialPrefs: Record<string, boolean>;
}

/**
 * Combined Preferences panel (ADR 0021): default-locale picker plus
 * the notification toggles, saved together in one PATCH. The navbar's
 * locale toggle stays a session-only switch; this is the value applied
 * to the URL prefix on the next sign-in. Theme is deliberately not here
 * — it lives in `next-themes`/localStorage and persists per-device.
 */
export function PreferencesForm({
  initialLocale,
  initialPrefs,
}: PreferencesFormProps) {
  const t = useTranslations("settings.preferences");
  const tn = useTranslations("settings.notifications");
  const tErr = useTranslations("errors");
  const router = useRouter();
  const { showToast } = useToast();

  const [locale, setLocale] = useState<Locale>(initialLocale);
  // `true` means enabled; missing or non-`false` defaults to enabled.
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
        body: JSON.stringify({ locale, notification_prefs: prefs }),
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

        <div className={styles.field}>
          <label htmlFor="locale" className={styles.label}>
            {t("language")}
          </label>
          <select
            id="locale"
            className={styles.select}
            value={locale}
            onChange={(e) => setLocale(e.target.value as Locale)}
          >
            <option value="es">{t("languageEs")}</option>
            <option value="en">{t("languageEn")}</option>
          </select>
          <p className={styles.hint}>{t("languageHint")}</p>
        </div>
      </section>

      <section className={styles.section}>
        <header className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>{tn("title")}</h2>
          <p className={styles.sectionHint}>{tn("hint")}</p>
        </header>

        <ul className={styles.list}>
          {NOTIFICATION_KINDS.map((kind) => {
            const token = KIND_I18N_TOKEN[kind];
            return (
              <li key={kind} className={styles.row}>
                <div className={styles.rowMain}>
                  <strong>{tn(`kind.${token}.title`)}</strong>
                  <span className={styles.rowHint}>
                    {tn(`kind.${token}.hint`)}
                  </span>
                </div>
                <label className={styles.toggle}>
                  <input
                    type="checkbox"
                    checked={prefs[kind]}
                    onChange={() => toggle(kind)}
                    aria-label={tn(`kind.${token}.title`)}
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

export default PreferencesForm;
