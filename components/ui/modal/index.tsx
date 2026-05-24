"use client";

import { useEffect, useCallback, useRef, useId } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { CloseIcon, ArrowLeftIcon } from "@/components/icons";
import { useClickOutside } from "@/lib/hooks/useClickOutside";
import styles from "./modal.module.scss";

type ModalSize = "sm" | "md" | "lg";

interface ModalProps {
  children: React.ReactNode;
  onClose: () => void;
  title?: React.ReactNode;
  /**
   * Fallback accessible label when the modal has no visible `title`.
   * If neither is provided the modal is announced without a name.
   */
  ariaLabel?: string;
  /**
   * When provided, renders a back arrow to the left of the title.
   * Use for multi-step modals like sign-in's nsec sub-panel.
   */
  onBack?: () => void;
  size?: ModalSize;
  className?: string;
}

// Matches every interactive element a keyboard user can reach inside
// the dialog. Used by the focus trap to wrap Tab / Shift+Tab.
const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

export function Modal({
  children,
  onClose,
  title,
  ariaLabel,
  onBack,
  size = "md",
  className,
}: ModalProps) {
  const t = useTranslations("common");
  const modalRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useClickOutside(modalRef, onClose);

  // Store the element that was focused when the modal mounted so we
  // can send focus back to it on close. Without this, keyboard users
  // lose context after dismissing the dialog.
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;

    const firstFocusable =
      modalRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
    firstFocusable?.focus();

    return () => {
      previouslyFocused?.focus();
    };
  }, []);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }

      // Focus trap: when Tab would move past the last focusable
      // element (or before the first), wrap around so keyboard users
      // can't escape the dialog into the background content.
      if (e.key !== "Tab" || !modalRef.current) return;
      const focusables = Array.from(
        modalRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement | null;

      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    },
    [onClose]
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [handleKeyDown]);

  // Portal to <body> so the overlay is never trapped inside an
  // ancestor stacking context (e.g. the storefront hero's
  // `isolation: isolate`), which would let later-in-DOM content paint
  // over a fixed, high-z-index modal. Modals only mount on client
  // interaction, so `document` is defined whenever this renders; guard
  // against SSR just in case.
  const overlay = (
    <div
      className={styles.overlay}
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? titleId : undefined}
      aria-label={title ? undefined : ariaLabel}
    >
      <div ref={modalRef} className={cn(styles.modal, styles[size], className)}>
        {title && (
          <div className={styles.titleRow}>
            {onBack && (
              <button
                type="button"
                className={styles.backButton}
                onClick={onBack}
                aria-label={t("back")}
              >
                <ArrowLeftIcon size={18} />
              </button>
            )}
            <h3 id={titleId} className={styles.title}>
              {title}
            </h3>
          </div>
        )}
        <button
          className={styles.closeButton}
          onClick={onClose}
          aria-label={t("closeDialog")}
        >
          <CloseIcon size={20} />
        </button>
        {children}
      </div>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(overlay, document.body);
}

export default Modal;
