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
import { checkAlias, checkCbu } from "@/lib/admin/ar-bank-id";
import styles from "./payout-form.module.scss";

// Minimal user@domain shape check for the LN address before hitting
// the server's LUD-21 probe — catches obvious typos without a round
// trip. The probe remains the authoritative check.
const LN_ADDRESS_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// LUD-21 probe failure reason → seller-facing message key.
const LN_PROBE_REASON_KEYS: Record<string, string> = {
  invalid_address: "lightningAddressInvalidFormat",
  lnurl_unreachable: "lightningAddressUnreachable",
  lnurl_no_lud21: "lightningAddressNoLud21",
  lnurl_invalid_response: "lightningAddressMalformed",
  bolt11_no_payment_hash: "lightningAddressMalformed",
};

/**
 * Maps a /api/settings error response to the best `settings.form`
 * message key, so the toast reflects the actual server-side reason
 * (bad CBU, bad alias, LN format/LUD-21, auth) instead of a generic
 * failure. Returns a key; the component passes it through `t()`.
 */
function serverErrorMessageKey(
  json: {
    error?: string;
    reason?: string;
    issues?: Array<{ message?: string }>;
  } | null
): string {
  if (!json) return "saveFailed";
  // LUD-21 probe failure (top-level error + reason).
  if (json.error === "lightning_address_invalid") {
    return (
      (json.reason && LN_PROBE_REASON_KEYS[json.reason]) ??
      "lightningAddressInvalid"
    );
  }
  // Zod schema failures arrive as invalid_body + issues[].message,
  // where each message is the schema's refine code.
  if (json.error === "invalid_body" && Array.isArray(json.issues)) {
    const messages = json.issues.map((i) => i.message);
    if (messages.includes("cbu_invalid")) return "cbuInvalid";
    if (messages.includes("alias_invalid")) return "aliasInvalid";
    if (messages.includes("lightning_address_invalid")) {
      return "lightningAddressInvalidFormat";
    }
  }
  if (json.error === "auth_clock_skew") return "signClockSkew";
  if (json.error === "auth_invalid_signature") return "signRequiredBody";
  return "saveFailed";
}

type PayoutMethod = "cbu_alias" | "lightning_address";
type TransferSpeed = "fiat_transfer" | "fast_fiat_transfer";

interface PayoutFormProps {
  initialCbu: string;
  initialAlias: string;
  initialPayoutMethod: PayoutMethod;
  initialTransferSpeed: TransferSpeed;
  /**
   * The saved Lightning Address, used to seed the editable field on
   * the sats rail. The same value is also editable on the Profile tab
   * (as the Nostr lud16); both write the one `users.lightning_address`.
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
    lightningAddress: string;
  }) => void;
  /**
   * Embedded mode: render only the form fields, dropping the card
   * wrapper and the "How you get paid" header. Used inside the
   * payout-setup modal, which supplies its own title + intro — so we
   * avoid a card-inside-a-card and a duplicate heading. The Settings
   * page leaves this false and keeps the section card + header.
   */
  embedded?: boolean;
}

function emptyToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

// Field-level validators reused by the blur handlers and submit. They
// run the same BCRA checks as the server (checkCbu/checkAlias) and
// return the `settings.form` message key to show inline, or null when
// the field is empty (emptiness is handled by `destinationRequired`)
// or valid.
function cbuFieldError(value: string): string | null {
  if (value.trim() && checkCbu(value) !== null) return "cbuInvalid";
  return null;
}

function aliasFieldError(value: string): string | null {
  if (value.trim() && checkAlias(value) !== null) return "aliasInvalid";
  return null;
}

export function PayoutForm({
  initialCbu,
  initialAlias,
  initialPayoutMethod,
  initialTransferSpeed,
  currentLightningAddress,
  onSaved,
  embedded = false,
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
  // Inline format errors for the ARS-rail fields. Each holds a
  // `settings.form` message key (or null). Set on blur and on submit,
  // cleared as the user edits the field.
  const [cbuError, setCbuError] = useState<string | null>(null);
  const [aliasError, setAliasError] = useState<string | null>(null);
  // The LN address is the sats payout destination, editable here (and
  // also on the Profile tab as the Nostr lud16 — both write the same
  // field). Seeded from the saved value.
  const [lightningAddress, setLightningAddress] = useState(
    currentLightningAddress
  );
  const [transferSpeed, setTransferSpeed] =
    useState<TransferSpeed>(initialTransferSpeed);
  const [isPending, setIsPending] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (isPending) return;

    // Validate every field for the active rail before submitting, and
    // surface a specific message for each — the same validators the
    // server uses (checkCbu/checkAlias), so client and server agree.
    if (payoutMethod === "cbu_alias") {
      if (!cbu.trim() && !alias.trim()) {
        showToast(t("destinationRequired"), "error");
        return;
      }
      // CBU is 22 digits flat; alias follows the BCRA rule — 6–20 chars
      // of [A-Za-z0-9.-], at least one letter, no ñ/accents. Surface the
      // failure both inline (below the field) and as a toast.
      const nextCbuError = cbuFieldError(cbu);
      const nextAliasError = aliasFieldError(alias);
      setCbuError(nextCbuError);
      setAliasError(nextAliasError);
      const firstError = nextCbuError ?? nextAliasError;
      if (firstError) {
        showToast(t(firstError), "error");
        return;
      }
    }

    if (payoutMethod === "lightning_address") {
      if (!lightningAddress.trim()) {
        showToast(t("lightningAddressRequired"), "error");
        return;
      }
      if (!LN_ADDRESS_RE.test(lightningAddress.trim())) {
        showToast(t("lightningAddressInvalidFormat"), "error");
        return;
      }
    }

    const nextCbu = emptyToNull(cbu);
    const nextAlias = emptyToNull(alias);
    const nextLightningAddress = emptyToNull(lightningAddress);
    const cbuChanged = nextCbu !== emptyToNull(initialCbu);
    const aliasChanged = nextAlias !== emptyToNull(initialAlias);
    const railChanged = payoutMethod !== initialPayoutMethod;
    // An LN-address change is a payment-destination change → NIP-98
    // re-sign (ADR 0008/0015), same as cbu/alias/rail.
    const lightningChanged =
      nextLightningAddress !== emptyToNull(currentLightningAddress);
    const requiresReSign =
      cbuChanged || aliasChanged || railChanged || lightningChanged;

    setIsPending(true);
    try {
      const serialized = JSON.stringify({
        cbu: nextCbu,
        alias: nextAlias,
        payout_method: payoutMethod,
        transfer_speed: transferSpeed,
        lightning_address: nextLightningAddress,
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
        if (res.status === 404) {
          router.push("/");
          return;
        }
        const json = (await res.json().catch(() => null)) as {
          error?: string;
          reason?: string;
          issues?: Array<{ message?: string }>;
        } | null;
        if (res.status === 401 || res.status === 403) {
          showToast(
            t(
              json?.error === "auth_clock_skew"
                ? "signClockSkew"
                : "signRequiredBody"
            ),
            "error"
          );
          return;
        }
        // Surface the specific server-side error (bad CBU/alias, LN
        // format/LUD-21, …) rather than a generic failure.
        showToast(t(serverErrorMessageKey(json)), "error");
        return;
      }
      showToast(t("saved"), "success");
      if (onSaved) {
        onSaved({
          cbu: cbu.trim(),
          alias: alias.trim(),
          payoutMethod,
          lightningAddress: lightningAddress.trim(),
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
      <section className={embedded ? styles.fields : styles.section}>
        {embedded ? null : (
          <header className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>{t("sectionPayout")}</h2>
            <p className={styles.sectionHint}>{t("sectionPayoutHint")}</p>
          </header>
        )}

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
              onChange={() => {
                setPayoutMethod("cbu_alias");
                setCbuError(null);
                setAliasError(null);
              }}
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
              onChange={() => {
                setPayoutMethod("lightning_address");
                setCbuError(null);
                setAliasError(null);
              }}
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
                  className={`${styles.input} ${cbuError ? styles.inputError : ""}`}
                  value={cbu}
                  onChange={(e) => {
                    setCbu(e.target.value);
                    // Clear the error while the user corrects it; we
                    // re-check on blur and on submit.
                    if (cbuError) setCbuError(null);
                  }}
                  onBlur={(e) => setCbuError(cbuFieldError(e.target.value))}
                  placeholder={t("cbuPlaceholder")}
                  autoComplete="off"
                  spellCheck={false}
                  aria-invalid={cbuError ? true : undefined}
                  aria-describedby={cbuError ? "cbu-error" : undefined}
                />
                {cbuError ? (
                  <p id="cbu-error" className={styles.fieldError} role="alert">
                    {t(cbuError)}
                  </p>
                ) : null}
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
                  className={`${styles.input} ${aliasError ? styles.inputError : ""}`}
                  value={alias}
                  onChange={(e) => {
                    setAlias(e.target.value);
                    if (aliasError) setAliasError(null);
                  }}
                  onBlur={(e) => setAliasError(aliasFieldError(e.target.value))}
                  placeholder={t("aliasPlaceholder")}
                  maxLength={20}
                  autoComplete="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  aria-invalid={aliasError ? true : undefined}
                  aria-describedby={aliasError ? "alias-error" : undefined}
                />
                {aliasError ? (
                  <p
                    id="alias-error"
                    className={styles.fieldError}
                    role="alert"
                  >
                    {t(aliasError)}
                  </p>
                ) : null}
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
          // The LN address is the sats payout destination, so it's
          // editable right here — in Settings and in the modal. It is
          // also the public Nostr lud16, editable in the Profile tab
          // too; both write the same field. Validated server-side
          // (LUD-21 probe) on save.
          <div className={styles.field}>
            <label htmlFor="lightning_address" className={styles.label}>
              {t("lightningAddress")}
              <Tooltip
                text={t("lightningAddressTooltip")}
                example={t("lightningAddressExample")}
                label={tCommon("tooltipLabel")}
              />
            </label>
            <input
              id="lightning_address"
              type="text"
              inputMode="email"
              className={styles.input}
              value={lightningAddress}
              onChange={(e) => setLightningAddress(e.target.value)}
              placeholder={t("lightningAddressPlaceholder")}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
            />
          </div>
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
