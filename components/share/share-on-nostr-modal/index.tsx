"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { buildNoteEvent } from "@/lib/nostr/events";
import { publishSignedEvent } from "@/lib/nostr/publish";
import { isSignerCancellation } from "@/lib/nostr/auth-errors";
import type { NostrEvent } from "@/lib/nostr/types";
import { useSignerContext } from "@/lib/contexts/signer-context";
import { getBaseUrl } from "@/lib/env";
import styles from "./share-on-nostr-modal.module.scss";

/**
 * Discriminated context union so a single modal serves every "you
 * just did X" share moment. Cursats only ships `course-created`
 * today; future cases (e.g. `course-purchased` for the buyer) plug
 * in by adding a variant and a matching i18n key.
 */
export type ShareContext = {
  kind: "course-created";
  course: { userSlug: string; offeringSlug: string; title: string };
};

interface ShareOnNostrModalProps {
  context: ShareContext;
  onClose: () => void;
  onPublished?: () => void;
}

type PublishState = "idle" | "publishing" | "published" | "error";

function suggestedKeyFor(kind: ShareContext["kind"]): string {
  switch (kind) {
    case "course-created":
      return "suggested.courseCreated";
  }
}

export function ShareOnNostrModal({
  context,
  onClose,
  onPublished,
}: ShareOnNostrModalProps) {
  const t = useTranslations("shareOnNostr");
  const locale = useLocale();
  const { signWithPrompt } = useSignerContext();

  const link = useMemo(() => {
    // Strip a trailing slash so a NEXT_PUBLIC_BASE_URL of
    // "https://cursats.bitbybit.com.ar/" doesn't produce
    // "//es/<userSlug>/c/<offeringSlug>".
    const base = getBaseUrl().replace(/\/+$/, "");
    // English is the prefixed locale; Spanish is the unprefixed
    // default. Mirror the routing config so the link a Nostr
    // reader clicks doesn't bounce through an unnecessary redirect.
    const localePrefix = locale === "es" ? "" : `/${locale}`;
    return `${base}${localePrefix}/${context.course.userSlug}/c/${context.course.offeringSlug}`;
  }, [locale, context.course.userSlug, context.course.offeringSlug]);

  const initialContent = useMemo(() => {
    return t(suggestedKeyFor(context.kind), {
      title: context.course.title,
      link,
    });
  }, [context, link, t]);

  const [content, setContent] = useState(initialContent);
  const [state, setState] = useState<PublishState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handlePublish() {
    if (state === "publishing" || state === "published") return;
    setState("publishing");
    setErrorMessage(null);

    let signed: NostrEvent;
    try {
      signed = await signWithPrompt(buildNoteEvent(content));
    } catch (err) {
      // A declined signature (extension rejection, or dismissing the
      // re-sign prompt) is a deliberate choice, not a failure — drop
      // back to idle quietly so the seller can retry or skip. Anything
      // else is a real error.
      if (
        isSignerCancellation(err) ||
        (err instanceof Error && err.message === "re_sign_in_cancelled")
      ) {
        setState("idle");
        return;
      }
      setState("error");
      setErrorMessage(t("error"));
      return;
    }

    try {
      // Don't claim success until at least one relay has acknowledged
      // the event. A signed-but-unacknowledged note never landed.
      const { accepted } = await publishSignedEvent(signed);
      if (accepted === 0) {
        setState("error");
        setErrorMessage(t("error"));
        return;
      }
      setState("published");
      onPublished?.();
      // Hold the "Published!" state long enough to register before
      // the parent unmounts the modal.
      setTimeout(() => onClose(), 600);
    } catch {
      setState("error");
      setErrorMessage(t("error"));
    }
  }

  // Lock the controls while signing/broadcasting and through the brief
  // "Published!" hold, so a double-click can't fire a second signature
  // prompt and post a duplicate note.
  const isBusy = state === "publishing" || state === "published";

  return (
    <Modal onClose={onClose} title={t("title")} size="md">
      <p className={styles.subtitle}>{t("subtitle")}</p>
      <textarea
        className={styles.textarea}
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder={t("placeholder")}
        rows={6}
        disabled={isBusy}
        aria-label={t("title")}
      />
      <div className={styles.counter} aria-live="polite">
        {content.length}
      </div>
      {errorMessage && (
        <p className={styles.error} role="alert">
          {errorMessage}
        </p>
      )}
      <div className={styles.actions}>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={onClose}
          disabled={isBusy}
        >
          {t("cancel")}
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={handlePublish}
          disabled={isBusy || content.trim().length === 0}
        >
          {state === "publishing"
            ? t("publishing")
            : state === "published"
              ? t("published")
              : t("publish")}
        </Button>
      </div>
    </Modal>
  );
}

export default ShareOnNostrModal;
