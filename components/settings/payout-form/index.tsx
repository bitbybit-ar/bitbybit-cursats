"use client";

import { useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/routing";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { useToast } from "@/components/ui/toast";
import { useSignerContext } from "@/lib/contexts/signer-context";
import {
  buildSettingsAuthEvent,
  hashSettingsBody,
} from "@/lib/admin/sign-settings-payload";
import { isSignerCancellation } from "@/lib/nostr/auth-errors";
import styles from "./payout-form.module.scss";

type PayoutMethod = "cbu_alias" | "lightning_address";
type TransferSpeed = "fiat_transfer" | "fast_fiat_transfer";

interface PayoutFormProps {
  initialCbu: string;
  initialAlias: string;
  initialPayoutMethod: PayoutMethod;
  initialTransferSpeed: TransferSpeed;
  /**
   * Read-only display value. The actual Lightning Address is owned
   * by the Profile form; this section only shows the rail picker
   * and (when relevant) a pointer back to Profile.
   */
  currentLightningAddress: string;
  /**
   * When provided, replaces the default `router.refresh()` after a
   * successful save. The payout-setup modal in the create-course
   * flow uses this to close itself and continue the parent form
   * submission with the freshly-saved values.
   */
  onSaved?: (next: {
    cbu: string;
    alias: string;
    payoutMethod: PayoutMethod;
  }) => void;
}

function emptyToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

export function PayoutForm({
  initialCbu,
  initialAlias,
  initialPayoutMethod,
  initialTransferSpeed,
  currentLightningAddress,
  onSaved,
}: PayoutFormProps) {
  const t = useTranslations("settings.form");
  const tCommon = useTranslations("common");
  const tErr = useTranslations("errors");
  const router = useRouter();
  const { showToast } = useToast();
  const { signWithPrompt } = useSignerContext();

  const [payoutMethod, setPayoutMethod] =
    useState<PayoutMethod>(initialPayoutMethod);
  const [cbu, setCbu] = useState(initialCbu);
  const [alias, setAlias] = useState(initialAlias);
  const [transferSpeed, setTransferSpeed] =
    useState<TransferSpeed>(initialTransferSpeed);
  const [isPending, setIsPending] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (isPending) return;

    if (payoutMethod === "cbu_alias" && !cbu.trim() && !alias.trim()) {
      showToast(t("destinationRequired"), "error");
      return;
    }
    if (
      payoutMethod === "lightning_address" &&
      !currentLightningAddress.trim()
    ) {
      showToast(t("lightningAddressRequired"), "error");
      return;
    }

    const nextCbu = emptyToNull(cbu);
    const nextAlias = emptyToNull(alias);
    const cbuChanged = nextCbu !== emptyToNull(initialCbu);
    const aliasChanged = nextAlias !== emptyToNull(initialAlias);
    const railChanged = payoutMethod !== initialPayoutMethod;
    const requiresReSign = cbuChanged || aliasChanged || railChanged;

    setIsPending(true);
    try {
      const serialized = JSON.stringify({
        cbu: nextCbu,
        alias: nextAlias,
        payout_method: payoutMethod,
        transfer_speed: transferSpeed,
      });

      const headers: Record<string, string> = {
        "content-type": "application/json",
      };

      if (requiresReSign) {
        const url = new URL("/api/settings", window.location.origin).toString();
        const payloadHash = await hashSettingsBody(serialized);
        const unsigned = buildSettingsAuthEvent(url, payloadHash);
        try {
          const signed = await signWithPrompt(unsigned);
          headers.Authorization = `Nostr ${btoa(JSON.stringify(signed))}`;
        } catch (err) {
          if (
            isSignerCancellation(err) ||
            (err instanceof Error && err.message === "re_sign_in_cancelled")
          ) {
            showToast(t("signCancelled"), "info");
            return;
          }
          showToast(t("saveFailed"), "error");
          return;
        }
      }

      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers,
        body: serialized,
      });
      if (!res.ok) {
        if (res.status === 401 || res.status === 404) {
          if (res.status === 404) {
            router.push("/");
            return;
          }
          const json = (await res.json().catch(() => null)) as {
            error?: string;
          } | null;
          if (json?.error === "auth_clock_skew") {
            showToast(t("signClockSkew"), "error");
            return;
          }
          showToast(t("signRequiredBody"), "error");
          return;
        }
        showToast(t("saveFailed"), "error");
        return;
      }
      showToast(t("saved"), "success");
      if (onSaved) {
        onSaved({
          cbu: cbu.trim(),
          alias: alias.trim(),
          payoutMethod,
        });
      } else {
        router.refresh();
      }
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
          <h2 className={styles.sectionTitle}>{t("sectionPayout")}</h2>
          <p className={styles.sectionHint}>{t("sectionPayoutHint")}</p>
        </header>

        <fieldset className={styles.fieldset}>
          <legend className={styles.legend}>{t("payoutMethod")}</legend>
          <label
            className={`${styles.radio} ${payoutMethod === "cbu_alias" ? styles.radioSelected : ""}`}
          >
            <input
              type="radio"
              name="payout_method"
              value="cbu_alias"
              checked={payoutMethod === "cbu_alias"}
              onChange={() => setPayoutMethod("cbu_alias")}
            />
            <span>
              <strong>{t("railArs")}</strong>
              <span className={styles.radioHint}>{t("railArsHint")}</span>
            </span>
          </label>
          <label
            className={`${styles.radio} ${payoutMethod === "lightning_address" ? styles.radioSelected : ""}`}
          >
            <input
              type="radio"
              name="payout_method"
              value="lightning_address"
              checked={payoutMethod === "lightning_address"}
              onChange={() => setPayoutMethod("lightning_address")}
            />
            <span>
              <strong>{t("railSats")}</strong>
              <span className={styles.radioHint}>{t("railSatsHint")}</span>
            </span>
          </label>
        </fieldset>

        {payoutMethod === "cbu_alias" ? (
          <>
          <div className={styles.row}>
            <div className={styles.field}>
              <label htmlFor="cbu" className={styles.label}>
                {t("cbu")}
                <Tooltip
                  text={t("cbuTooltip")}
                  example={t("cbuExample")}
                  label={tCommon("tooltipLabel")}
                />
              </label>
              <input
                id="cbu"
                type="text"
                inputMode="numeric"
                className={styles.input}
                value={cbu}
                onChange={(e) => setCbu(e.target.value)}
                placeholder={t("cbuPlaceholder")}
                autoComplete="off"
                spellCheck={false}
              />
            </div>

            <div className={styles.field}>
              <label htmlFor="alias" className={styles.label}>
                {t("alias")}
                <Tooltip
                  text={t("aliasTooltip")}
                  example={t("aliasExample")}
                  label={tCommon("tooltipLabel")}
                />
              </label>
              <input
                id="alias"
                type="text"
                className={styles.input}
                value={alias}
                onChange={(e) => setAlias(e.target.value)}
                placeholder={t("aliasPlaceholder")}
                autoComplete="off"
                spellCheck={false}
              />
            </div>
          </div>

          <fieldset className={styles.fieldset}>
            <legend className={styles.legend}>{t("transferSpeed")}</legend>
            <p className={styles.sectionHint}>{t("transferSpeedHint")}</p>
            <label
              className={`${styles.radio} ${transferSpeed === "fiat_transfer" ? styles.radioSelected : ""}`}
            >
              <input
                type="radio"
                name="transfer_speed"
                value="fiat_transfer"
                checked={transferSpeed === "fiat_transfer"}
                onChange={() => setTransferSpeed("fiat_transfer")}
              />
              <span>
                <strong>{t("transferStandard")}</strong>
                <span className={styles.radioHint}>
                  {t("transferStandardHint")}
                </span>
              </span>
            </label>
            <label
              className={`${styles.radio} ${transferSpeed === "fast_fiat_transfer" ? styles.radioSelected : ""}`}
            >
              <input
                type="radio"
                name="transfer_speed"
                value="fast_fiat_transfer"
                checked={transferSpeed === "fast_fiat_transfer"}
                onChange={() => setTransferSpeed("fast_fiat_transfer")}
              />
              <span>
                <strong>{t("transferFast")}</strong>
                <span className={styles.radioHint}>
                  {t("transferFastHint")}
                </span>
              </span>
            </label>
          </fieldset>
          </>
        ) : (
          <p className={styles.payoutLnNote}>
            {t("payoutLnNote", {
              address: currentLightningAddress || t("payoutLnEmpty"),
            })}
          </p>
        )}
      </section>

      <div className={styles.actions}>
        <Button type="submit" variant="primary" disabled={isPending}>
          {isPending ? t("saving") : t("save")}
        </Button>
      </div>
    </form>
  );
}

export default PayoutForm;
