"use client";

import { useState, type FormEvent } from "react";
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
import { useSignerContext } from "@/lib/contexts/signer-context";
import type { Offering } from "@/lib/admin/offerings";
import styles from "./offering-form.module.scss";

interface OfferingFormProps {
  /** When provided, the form pre-populates and submits a PATCH. */
  offering?: Offering;
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

export function OfferingForm({ offering }: OfferingFormProps) {
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
  const [priceCurrency, setPriceCurrency] = useState<"ars" | "sats">(
    offering?.price_currency ?? "ars"
  );
  const [imageUrl, setImageUrl] = useState(offering?.image_url ?? "");
  const [codeCount, setCodeCount] = useState("10");
  const [downloadUrl, setDownloadUrl] = useState(offering?.download_url ?? "");

  function handleTitleChange(next: string) {
    setTitle(next);
    if (!slugManuallyEdited) setSlug(slugify(next));
  }

  function handleSlugChange(next: string) {
    setSlug(next);
    setSlugManuallyEdited(true);
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (isPending) return;

    const priceAmountNum = Number.parseInt(priceAmount, 10);
    if (Number.isNaN(priceAmountNum) || priceAmountNum <= 0) {
      showToast(t("invalidPriceAmount"), "error");
      return;
    }

    if (imageUrl.trim() === "") {
      showToast(t("imageRequired"), "error");
      return;
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
        return;
      }
    }

    if (type === "download" && downloadUrl.trim() === "") {
      showToast(t("downloadUrlRequired"), "error");
      return;
    }

    const payload: OfferingPayload = {
      slug: slug.trim(),
      type,
      title: title.trim(),
      description: description.trim(),
      price_amount: priceAmountNum,
      price_currency: priceCurrency,
      image_url: imageUrl.trim(),
      download_url: type === "download" ? downloadUrl.trim() : null,
      code_count: codeCountNum,
    };

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
        if (data.error === "slug_taken") {
          showToast(t("slugTaken"), "error");
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
    <form className={styles.form} onSubmit={handleSubmit}>
      <section className={styles.section}>
        <header className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>{t("sectionBasics")}</h2>
          <p className={styles.sectionHint}>{t("sectionBasicsHint")}</p>
        </header>

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
      </section>

      <section className={styles.section}>
        <header className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>{t("sectionPricing")}</h2>
          <p className={styles.sectionHint}>{t("sectionPricingHint")}</p>
        </header>

        <fieldset className={styles.fieldset}>
          <legend className={styles.legend}>{t("priceCurrency")}</legend>
          <label
            className={`${styles.radio} ${priceCurrency === "ars" ? styles.radioSelected : ""}`}
          >
            <input
              type="radio"
              name="priceCurrency"
              value="ars"
              checked={priceCurrency === "ars"}
              onChange={() => setPriceCurrency("ars")}
            />
            <span>
              <strong>{t("priceCurrencyArs")}</strong>
              <span className={styles.radioHint}>
                {t("priceCurrencyArsHint")}
              </span>
            </span>
          </label>
          <label
            className={`${styles.radio} ${priceCurrency === "sats" ? styles.radioSelected : ""}`}
          >
            <input
              type="radio"
              name="priceCurrency"
              value="sats"
              checked={priceCurrency === "sats"}
              onChange={() => setPriceCurrency("sats")}
            />
            <span>
              <strong>{t("priceCurrencySats")}</strong>
              <span className={styles.radioHint}>
                {t("priceCurrencySatsHint")}
              </span>
            </span>
          </label>
        </fieldset>

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
              <span className={styles.radioHint}>{t("typeDownloadHint")}</span>
            </span>
          </label>
          {isEdit ? (
            <p id="type-lock-hint" className={styles.hint}>
              {t("typeLocked")}
            </p>
          ) : null}
        </fieldset>

        {type === "code" && !isEdit ? (
          <div className={styles.field}>
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
          label={t("imageUrl")}
          required
        />
      </section>

      <div className={styles.actions}>
        <Button type="submit" variant="primary" disabled={isPending}>
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
    </form>
  );
}

export default OfferingForm;
