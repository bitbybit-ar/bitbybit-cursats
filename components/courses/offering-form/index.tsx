"use client";

import { useState, useEffect, type FormEvent, type KeyboardEvent } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/routing";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { useToast } from "@/components/ui/toast";
import { ImageUpload } from "@/components/ui/image-upload";
import {
  ShareOnNostrModal,
  type ShareContext,
} from "@/components/share/share-on-nostr-modal";
import {
  PayoutSetupModal,
  type PayoutSavedValues,
} from "@/components/courses/payout-setup-modal";
import { useSignerContext } from "@/lib/contexts/signer-context";
import { MAX_TAGS_PER_OFFERING, type Offering } from "@/lib/admin/offerings";
import { WAPU_MIN_NET_ARS } from "@/lib/wapu-limits";
import styles from "./offering-form.module.scss";

type PayoutMethod = "cbu_alias" | "lightning_address";

export interface OfferingFormPayoutState {
  cbu: string;
  alias: string;
  lightningAddress: string;
  payoutMethod: PayoutMethod;
}

interface OfferingFormProps {
  /** When provided, the form pre-populates and submits a PATCH. */
  offering?: Offering;
  /**
   * Current seller payout state from the user row. Used on create to
   * gate submission behind a payout-setup modal so the offering does
   * not get published unsellable. Optional because the edit-mode
   * call site does not need it (an existing offering implies the
   * seller already cleared this gate at create time).
   */
  payoutState?: OfferingFormPayoutState;
}

function isPayoutConfigured(state: OfferingFormPayoutState): boolean {
  if (state.payoutMethod === "lightning_address") {
    return state.lightningAddress.trim().length > 0;
  }
  return state.cbu.trim().length > 0 || state.alias.trim().length > 0;
}

interface OfferingPayload {
  slug: string;
  type: "code" | "download";
  title: string;
  description: string;
  price_amount: number;
  price_currency: "ars" | "sats";
  image_url: string;
  download_url: string | null;
  tags: string[];
  /** Only sent on create — minting more codes on edit is a separate flow. */
  code_count?: number;
}

/**
 * Slug auto-derivation from the title field. Lowercase, strip
 * diacritics, collapse non-alphanumerics to single hyphens, cap at
 * 80 characters to match the column length. Matches the regex
 * pattern enforced by `lib/admin/offerings.ts:SlugSchema`.
 */
function slugify(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/**
 * Same shape as `slugify` but capped at 32 to match the per-tag
 * length enforced by `TagSchema` in `lib/admin/offerings.ts`. Used
 * to normalise a raw chip-input value before it joins the tag list.
 */
function normalizeTagInput(raw: string): string {
  return slugify(raw).slice(0, 32);
}

export function OfferingForm({ offering, payoutState }: OfferingFormProps) {
  const t = useTranslations("myCourses.form");
  const tCommon = useTranslations("common");
  const tErr = useTranslations("errors");
  const router = useRouter();
  const { showToast } = useToast();
  const { session } = useSignerContext();

  const [isPending, setIsPending] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);
  // When a fresh create succeeds we hand off to the Share-on-Nostr
  // modal instead of immediately navigating away. The modal owns
  // the redirect via its `onClose` callback. Null on edit-mode
  // success (no share prompt for housekeeping edits).
  const [shareContext, setShareContext] = useState<ShareContext | null>(null);

  // Local mirror of the seller's payout state so the popup can update
  // it in place after a successful save without forcing a server
  // round-trip. Edit mode has no gate (existing offering implies the
  // seller already cleared it at create time), so the prop is optional.
  const [currentPayout, setCurrentPayout] =
    useState<OfferingFormPayoutState | null>(payoutState ?? null);
  const [showPayoutModal, setShowPayoutModal] = useState(false);
  // The payout-setup modal opens for two reasons:
  //   - the seller hit "Set up payment method" in the Pricing section
  //     (proactive setup, before pricing) — just unlock the form.
  //   - the submit-time / server gate caught a missing payout — resume
  //     the in-flight submission once it's saved.
  // This flag distinguishes them so a proactive setup doesn't try to
  // submit a not-yet-filled form.
  const [resumeSubmitAfterPayout, setResumeSubmitAfterPayout] = useState(false);

  const isEdit = offering !== undefined;

  const [title, setTitle] = useState(offering?.title ?? "");
  const [slug, setSlug] = useState(offering?.slug ?? "");
  // Edit mode starts with the slug locked to the existing value
  // unless the seller actively types into the field. Create mode
  // starts unlocked so typing the title fills the slug for free.
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(isEdit);

  // Type cannot be flipped on edit — switching from code→download
  // would strand the code_pool and vice-versa for download_url.
  const [type, setType] = useState<"code" | "download">(
    offering?.type ?? "code"
  );
  const [description, setDescription] = useState(offering?.description ?? "");
  const [priceAmount, setPriceAmount] = useState(
    offering ? String(offering.price_amount) : ""
  );
  // Price currency follows the payout rail (ADR 0026): ARS for the
  // cbu_alias rail, sats for lightning_address — there is no free
  // picker. In edit mode the offering's stored currency is
  // authoritative (the amount is denominated in it).
  const railCurrency: "ars" | "sats" =
    currentPayout?.payoutMethod === "lightning_address" ? "sats" : "ars";
  const priceCurrency: "ars" | "sats" = isEdit
    ? offering!.price_currency
    : railCurrency;
  // Three pricing states the section adapts to:
  //   - "unconfigured" — no payout method set yet (create only). The
  //     price currency is undefined until a rail is chosen, so we hide
  //     the price field and prompt the seller to set up payout first.
  //   - "wapu"         — cbu_alias rail → priced in ARS, seller bears
  //     the Wapu fee, net must clear WAPU_MIN_NET_ARS.
  //   - "lightning"    — lightning_address rail → priced in sats.
  // Edit mode always has a configured payout (an existing offering
  // implies the seller cleared the gate at create time), so it never
  // hits "unconfigured".
  const payoutConfigured =
    isEdit || (currentPayout !== null && isPayoutConfigured(currentPayout));
  const pricingMode: "unconfigured" | "wapu" | "lightning" = !payoutConfigured
    ? "unconfigured"
    : priceCurrency === "sats"
      ? "lightning"
      : "wapu";
  // Live Wapu fee + net estimate for ARS (cbu_alias) sellers, who
  // bear the fee (ADR 0026). Null until a valid price is entered.
  const [payoutQuote, setPayoutQuote] = useState<{
    fee_ars: number;
    net_ars: number;
  } | null>(null);
  // On the ARS (wapu_ars) rail the seller bears the fee, so the
  // withdrawal pays the net. Wapu rejects payouts below
  // WAPU_MIN_NET_ARS, so a course whose net falls under it could never
  // be paid out — block it (ADR 0026). Best-effort on the client (the
  // quote may still be loading); /api/my-courses enforces it server-side.
  const isBelowWapuMin =
    priceCurrency === "ars" &&
    payoutQuote !== null &&
    payoutQuote.net_ars < WAPU_MIN_NET_ARS;
  const [imageUrl, setImageUrl] = useState(offering?.image_url ?? "");
  const [codeCount, setCodeCount] = useState("10");
  const [downloadUrl, setDownloadUrl] = useState(offering?.download_url ?? "");
  const [tags, setTags] = useState<string[]>(offering?.tags ?? []);
  const [tagDraft, setTagDraft] = useState("");

  // Debounced Wapu fee/net estimate for ARS sellers. Sats sellers
  // have no conversion and no fee, so the quote stays null for them.
  useEffect(() => {
    if (priceCurrency !== "ars") {
      setPayoutQuote(null);
      return;
    }
    const amount = Number(priceAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setPayoutQuote(null);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch("/api/payout-quote", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ amount_ars: Math.round(amount) }),
        });
        if (!res.ok) {
          if (!cancelled) setPayoutQuote(null);
          return;
        }
        const json = (await res.json()) as {
          fee_ars: number;
          net_ars: number;
        };
        if (!cancelled) {
          setPayoutQuote({ fee_ars: json.fee_ars, net_ars: json.net_ars });
        }
      } catch {
        if (!cancelled) setPayoutQuote(null);
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [priceAmount, priceCurrency]);

  function commitTagDraft(): void {
    const cleaned = normalizeTagInput(tagDraft);
    if (cleaned.length === 0) {
      setTagDraft("");
      return;
    }
    if (tags.includes(cleaned)) {
      setTagDraft("");
      return;
    }
    if (tags.length >= MAX_TAGS_PER_OFFERING) {
      showToast(t("tagsMax", { max: MAX_TAGS_PER_OFFERING }), "error");
      return;
    }
    setTags([...tags, cleaned]);
    setTagDraft("");
  }

  function handleTagKeyDown(e: KeyboardEvent<HTMLInputElement>): void {
    if (e.key === "Enter" || e.key === ",") {
      // Enter and comma both commit a chip. Prevent the form submit
      // on Enter and the literal "," from leaking into the input.
      e.preventDefault();
      commitTagDraft();
      return;
    }
    if (e.key === "Backspace" && tagDraft.length === 0 && tags.length > 0) {
      // Backspace on an empty draft removes the most recent chip —
      // standard chip-input affordance.
      e.preventDefault();
      setTags(tags.slice(0, -1));
    }
  }

  function removeTag(tag: string): void {
    setTags(tags.filter((t) => t !== tag));
  }

  function handleTitleChange(next: string) {
    setTitle(next);
    if (!slugManuallyEdited) setSlug(slugify(next));
  }

  function handleSlugChange(next: string) {
    setSlug(next);
    setSlugManuallyEdited(true);
  }

  function buildPayload(): OfferingPayload | null {
    const priceAmountNum = Number.parseInt(priceAmount, 10);
    if (Number.isNaN(priceAmountNum) || priceAmountNum <= 0) {
      showToast(t("invalidPriceAmount"), "error");
      return null;
    }

    if (imageUrl.trim() === "") {
      showToast(t("imageRequired"), "error");
      return null;
    }

    if (isBelowWapuMin) {
      showToast(
        t("priceBelowWapuMin", { min: WAPU_MIN_NET_ARS.toLocaleString() }),
        "error"
      );
      return null;
    }

    let codeCountNum: number | undefined;
    if (type === "code" && !isEdit) {
      codeCountNum = Number.parseInt(codeCount, 10);
      if (
        Number.isNaN(codeCountNum) ||
        codeCountNum <= 0 ||
        codeCountNum > 10000
      ) {
        showToast(t("invalidCodeCount"), "error");
        return null;
      }
    }

    if (type === "download" && downloadUrl.trim() === "") {
      showToast(t("downloadUrlRequired"), "error");
      return null;
    }

    // Commit any tag still sitting in the draft input so a seller
    // who typed a tag and hit Save (instead of Enter) doesn't lose
    // it silently.
    const pendingTag = normalizeTagInput(tagDraft);
    const finalTags =
      pendingTag.length > 0 && !tags.includes(pendingTag)
        ? [...tags, pendingTag].slice(0, MAX_TAGS_PER_OFFERING)
        : tags;

    return {
      slug: slug.trim(),
      type,
      title: title.trim(),
      description: description.trim(),
      price_amount: priceAmountNum,
      price_currency: priceCurrency,
      image_url: imageUrl.trim(),
      download_url: type === "download" ? downloadUrl.trim() : null,
      tags: finalTags,
      code_count: codeCountNum,
    };
  }

  async function submitOffering(payload: OfferingPayload) {
    setIsPending(true);
    try {
      const url = isEdit
        ? `/api/my-courses/${offering!.id}`
        : "/api/my-courses";
      const res = await fetch(url, {
        method: isEdit ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        if (res.status === 401 || res.status === 404) {
          router.push("/");
          return;
        }
        if (data.error === "payout_not_configured") {
          // BE caught a payout gap the FE check missed (e.g. stale
          // payoutState prop). Surface the modal so the seller can
          // recover without leaving the page, then resume this submit.
          setResumeSubmitAfterPayout(true);
          setShowPayoutModal(true);
          showToast(t("payoutNotConfigured"), "error");
          return;
        }
        if (data.error === "slug_taken") {
          showToast(t("slugTaken"), "error");
        } else if (data.error === "price_below_wapu_minimum") {
          showToast(
            t("priceBelowWapuMin", { min: WAPU_MIN_NET_ARS.toLocaleString() }),
            "error"
          );
        } else {
          showToast(t("saveFailed"), "error");
        }
        return;
      }
      showToast(t("saved"), "success");
      if (!isEdit && session?.user) {
        // Fresh create — pause on this page so the share modal can
        // mount. The modal's onClose handles the redirect once the
        // seller either publishes or dismisses.
        const data = (await res.json().catch(() => null)) as {
          offering?: { slug?: string };
        } | null;
        const offeringSlug = data?.offering?.slug ?? payload.slug;
        setShareContext({
          kind: "course-created",
          course: {
            userSlug: session.user.slug,
            offeringSlug,
            title: payload.title,
          },
        });
        return;
      }
      router.push("/my-courses");
      router.refresh();
    } catch {
      showToast(tErr("network"), "error");
    } finally {
      setIsPending(false);
    }
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (isPending) return;

    const payload = buildPayload();
    if (!payload) return;

    // Pre-check seller's payout state on create. Edit-mode skips
    // the gate (existing offering already passed at create time).
    // Reaching this with the new Pricing UI is a backstop — the price
    // field is hidden until payout is set up — so resume the submit
    // once the modal saves.
    if (!isEdit && currentPayout && !isPayoutConfigured(currentPayout)) {
      setResumeSubmitAfterPayout(true);
      setShowPayoutModal(true);
      return;
    }

    await submitOffering(payload);
  }

  // Proactive setup from the Pricing section: the seller has no rail
  // yet, so opening the modal here should just unlock the form (the
  // price field appears once a rail is chosen) — not submit.
  function openPayoutSetup() {
    setResumeSubmitAfterPayout(false);
    setShowPayoutModal(true);
  }

  function handlePayoutSaved(next: PayoutSavedValues) {
    // Adopt the freshly-saved payout state wholesale — the modal now
    // edits the LN address too, so we take its value rather than
    // preserving a stale one (a seller can set their LN address here).
    setCurrentPayout({
      cbu: next.cbu,
      alias: next.alias,
      lightningAddress: next.lightningAddress,
      payoutMethod: next.payoutMethod,
    });
    setShowPayoutModal(false);

    // Only replay the submission when the modal was opened by the
    // submit/server gate. A proactive setup (from the Pricing button)
    // just unlocks the now-priced-able form and lets the seller carry
    // on filling it in.
    if (!resumeSubmitAfterPayout) return;
    setResumeSubmitAfterPayout(false);
    // The merged state passes `isPayoutConfigured` (PayoutForm blocks
    // a save that wouldn't), so the submission can proceed.
    const payload = buildPayload();
    if (!payload) return;
    void submitOffering(payload);
  }

  async function handleArchive() {
    if (!offering) return;
    if (isArchiving) return;
    if (!window.confirm(t("archiveConfirm"))) return;

    setIsArchiving(true);
    try {
      const res = await fetch(`/api/my-courses/${offering.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        showToast(t("archiveFailed"), "error");
        return;
      }
      showToast(t("archived"), "success");
      router.push("/my-courses");
      router.refresh();
    } catch {
      showToast(tErr("network"), "error");
    } finally {
      setIsArchiving(false);
    }
  }

  return (
    <>
      <form className={styles.form} onSubmit={handleSubmit}>
        <section className={styles.section}>
          <header className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>{t("sectionBasics")}</h2>
            <p className={styles.sectionHint}>{t("sectionBasicsHint")}</p>
          </header>

          <div className={styles.row}>
            <div className={styles.field}>
              <label htmlFor="title" className={styles.label}>
                {t("title")}
              </label>
              <input
                id="title"
                type="text"
                className={styles.input}
                value={title}
                onChange={(e) => handleTitleChange(e.target.value)}
                required
                maxLength={200}
              />
            </div>

            <div className={styles.field}>
              <label htmlFor="slug" className={styles.label}>
                {t("slug")}
                <Tooltip
                  text={t("slugHint")}
                  example={t("slugExample")}
                  label={tCommon("tooltipLabel")}
                />
              </label>
              <input
                id="slug"
                type="text"
                className={styles.input}
                value={slug}
                onChange={(e) => handleSlugChange(e.target.value)}
                required
                maxLength={80}
                pattern="[a-z0-9]+(-[a-z0-9]+)*"
                autoComplete="off"
                spellCheck={false}
              />
            </div>
          </div>

          <div className={styles.field}>
            <label htmlFor="description" className={styles.label}>
              {t("description")}
            </label>
            <textarea
              id="description"
              className={styles.textarea}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
              rows={5}
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="tagInput" className={styles.label}>
              {t("tags")}
              <span className={styles.optional}>{t("optional")}</span>
              <Tooltip
                text={t("tagsHint")}
                example={t("tagsExample")}
                label={tCommon("tooltipLabel")}
              />
            </label>
            <div
              className={styles.chipInput}
              onClick={() => document.getElementById("tagInput")?.focus()}
              role="presentation"
            >
              {tags.map((tag) => (
                <span key={tag} className={styles.chip}>
                  <span className={styles.chipLabel}>{tag}</span>
                  <button
                    type="button"
                    className={styles.chipRemove}
                    onClick={() => removeTag(tag)}
                    aria-label={t("tagsRemove", { tag })}
                  >
                    ×
                  </button>
                </span>
              ))}
              <input
                id="tagInput"
                type="text"
                className={styles.chipInputField}
                value={tagDraft}
                onChange={(e) => setTagDraft(e.target.value)}
                onKeyDown={handleTagKeyDown}
                onBlur={commitTagDraft}
                placeholder={tags.length === 0 ? t("tagsPlaceholder") : ""}
                maxLength={32}
                autoComplete="off"
                spellCheck={false}
                disabled={tags.length >= MAX_TAGS_PER_OFFERING}
              />
            </div>
            <p className={styles.hint}>
              {t("tagsHelp", { max: MAX_TAGS_PER_OFFERING })}
            </p>
          </div>
        </section>

        <section className={styles.section}>
          <header className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>
              {t("sectionPricing")}
              <Tooltip
                text={t("sectionPricingHint")}
                label={tCommon("tooltipLabel")}
              />
            </h2>
          </header>

          {pricingMode === "unconfigured" ? (
            // No payout rail yet — the price currency is undefined, so
            // hide the price field entirely and prompt setup instead.
            <div className={styles.payoutCallout}>
              <p className={styles.payoutCalloutText}>
                {t("pricingSetupNeeded")}
              </p>
              <Button
                type="button"
                variant="secondary"
                onClick={openPayoutSetup}
                className={styles.payoutCalloutButton}
              >
                {t("pricingSetupButton")}
              </Button>
            </div>
          ) : (
            <div className={styles.row}>
              <div className={styles.field}>
                <label htmlFor="priceAmount" className={styles.label}>
                  {priceCurrency === "ars" ? t("priceArs") : t("priceSats")}
                  <Tooltip
                    text={t("priceAmountHint")}
                    example={t("priceAmountExample")}
                    label={tCommon("tooltipLabel")}
                  />
                </label>
                <input
                  id="priceAmount"
                  type="number"
                  min={1}
                  step={1}
                  className={styles.input}
                  value={priceAmount}
                  onChange={(e) => setPriceAmount(e.target.value)}
                  required
                />
              </div>

              <div className={styles.priceAside}>
                <p className={styles.sectionHint}>
                  {priceCurrency === "ars"
                    ? t("priceCurrencyNoteArs")
                    : t("priceCurrencyNoteSats")}
                </p>
                {priceCurrency === "ars" && payoutQuote ? (
                  <p className={styles.payoutEstimate}>
                    {t("payoutEstimate", {
                      fee: payoutQuote.fee_ars.toLocaleString(),
                      net: payoutQuote.net_ars.toLocaleString(),
                    })}
                  </p>
                ) : null}
                {isBelowWapuMin ? (
                  <p className={styles.payoutWarning} role="alert">
                    {t("priceBelowWapuMin", {
                      min: WAPU_MIN_NET_ARS.toLocaleString(),
                    })}
                  </p>
                ) : null}
              </div>
            </div>
          )}
        </section>

        <section className={styles.section}>
          <header className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>{t("sectionContent")}</h2>
            <p className={styles.sectionHint}>{t("sectionContentHint")}</p>
          </header>

          <fieldset
            className={styles.fieldset}
            disabled={isEdit}
            aria-describedby={isEdit ? "type-lock-hint" : undefined}
          >
            <legend className={styles.legend}>{t("type")}</legend>
            <label
              className={`${styles.radio} ${type === "code" ? styles.radioSelected : ""}`}
            >
              <input
                type="radio"
                name="type"
                value="code"
                checked={type === "code"}
                onChange={() => setType("code")}
              />
              <span>
                <strong>{t("typeCode")}</strong>
                <span className={styles.radioHint}>{t("typeCodeHint")}</span>
              </span>
            </label>
            <label
              className={`${styles.radio} ${type === "download" ? styles.radioSelected : ""}`}
            >
              <input
                type="radio"
                name="type"
                value="download"
                checked={type === "download"}
                onChange={() => setType("download")}
              />
              <span>
                <strong>{t("typeDownload")}</strong>
                <span className={styles.radioHint}>
                  {t("typeDownloadHint")}
                </span>
              </span>
            </label>
            {isEdit ? (
              <p id="type-lock-hint" className={styles.hint}>
                {t("typeLocked")}
              </p>
            ) : null}
          </fieldset>

          {type === "code" && !isEdit ? (
            <div className={`${styles.field} ${styles.fieldNarrow}`}>
              <label htmlFor="codeCount" className={styles.label}>
                {t("codeCount")}
                <Tooltip
                  text={t("codeCountHint")}
                  example={t("codeCountExample")}
                  label={tCommon("tooltipLabel")}
                />
              </label>
              <input
                id="codeCount"
                type="number"
                min={1}
                max={10000}
                step={1}
                className={styles.input}
                value={codeCount}
                onChange={(e) => setCodeCount(e.target.value)}
                required
              />
            </div>
          ) : null}

          {type === "code" && isEdit && offering ? (
            <div className={styles.field}>
              <p className={styles.hint}>
                {t("codePoolRemaining", {
                  count: offering.code_pool?.length ?? 0,
                })}
              </p>
            </div>
          ) : null}

          {type === "download" ? (
            <div className={styles.field}>
              <label htmlFor="downloadUrl" className={styles.label}>
                {t("downloadUrl")}
                <Tooltip
                  text={t("downloadUrlHint")}
                  example={t("downloadUrlExample")}
                  label={tCommon("tooltipLabel")}
                />
              </label>
              <input
                id="downloadUrl"
                type="url"
                className={styles.input}
                value={downloadUrl}
                onChange={(e) => setDownloadUrl(e.target.value)}
                placeholder="https://…"
                required
              />
            </div>
          ) : null}
        </section>

        <section className={styles.section}>
          <header className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>{t("sectionCover")}</h2>
            <p className={styles.sectionHint}>{t("sectionCoverHint")}</p>
          </header>

          <ImageUpload
            value={imageUrl ? imageUrl : null}
            onChange={(next) => setImageUrl(next ?? "")}
          />
        </section>

        <div className={styles.actions}>
          <Button
            type="submit"
            variant="primary"
            disabled={
              isPending || isBelowWapuMin || pricingMode === "unconfigured"
            }
          >
            {isPending ? t("saving") : isEdit ? t("saveEdit") : t("saveCreate")}
          </Button>
          {isEdit ? (
            <Button
              type="button"
              variant="danger"
              onClick={handleArchive}
              disabled={isArchiving}
            >
              {isArchiving ? t("archiving") : t("archive")}
            </Button>
          ) : null}
        </div>
      </form>

      {/* Modals are siblings of the form, not children — PayoutSetupModal
          embeds the settings PayoutForm (its own <form>), so nesting it
          inside <form> would be invalid HTML and confuse Enter-key submit. */}
      {shareContext ? (
        <ShareOnNostrModal
          context={shareContext}
          onClose={() => {
            setShareContext(null);
            router.push("/my-courses");
            router.refresh();
          }}
        />
      ) : null}

      {showPayoutModal && currentPayout ? (
        <PayoutSetupModal
          initialCbu={currentPayout.cbu}
          initialAlias={currentPayout.alias}
          initialPayoutMethod={currentPayout.payoutMethod}
          currentLightningAddress={currentPayout.lightningAddress}
          onSaved={handlePayoutSaved}
          onClose={() => setShowPayoutModal(false)}
        />
      ) : null}
    </>
  );
}

export default OfferingForm;
