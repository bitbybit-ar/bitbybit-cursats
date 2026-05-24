"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/routing";
import { useToast } from "@/components/ui/toast";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { CodePoolModal } from "@/components/courses/code-pool-modal";
import { useClickOutside } from "@/lib/hooks/useClickOutside";
import {
  ArchiveIcon,
  EyeIcon,
  KeyIcon,
  MoreIcon,
  PencilIcon,
  ShoppingBagIcon,
  TrashIcon,
} from "@/components/icons";
import styles from "./course-row-actions.module.scss";

interface CourseRowActionsProps {
  offeringId: string;
  offeringSlug: string;
  /** The seller's storefront handle, used to build the public URL. */
  userSlug: string;
  type: "code" | "download";
  /** Count of paid sales — gates the (permanent) delete action. */
  salesCount: number;
  /** Unused codes left in the pool, shown in the mint modal. */
  codeRemaining: number;
}

/**
 * Per-course kebab menu on the My courses list. Navigational items
 * (View, See orders, Edit) are links; destructive and stateful items
 * (Mint, Archive, Delete) open a modal. Archive is the reversible
 * soft-delete; Delete permanently removes the course and is only
 * allowed while it has no sales (the server enforces this too).
 */
export function CourseRowActions({
  offeringId,
  offeringSlug,
  userSlug,
  type,
  salesCount,
  codeRemaining,
}: CourseRowActionsProps) {
  const t = useTranslations("myCourses.actions");
  const tForm = useTranslations("myCourses.form");
  const tCommon = useTranslations("common");
  const tErr = useTranslations("errors");
  const router = useRouter();
  const { showToast } = useToast();

  const [menuOpen, setMenuOpen] = useState(false);
  const [showArchive, setShowArchive] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [showCodes, setShowCodes] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const wrapRef = useRef<HTMLDivElement>(null);
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  useClickOutside(wrapRef, closeMenu, menuOpen);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  const hasSales = salesCount > 0;

  async function handleArchive() {
    if (isArchiving) return;
    setIsArchiving(true);
    try {
      const res = await fetch(`/api/my-courses/${offeringId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        showToast(tForm("archiveFailed"), "error");
        return;
      }
      showToast(tForm("archived"), "success");
      setShowArchive(false);
      router.refresh();
    } catch {
      showToast(tErr("network"), "error");
    } finally {
      setIsArchiving(false);
    }
  }

  async function handleDelete() {
    if (isDeleting) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/my-courses/${offeringId}/delete`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        showToast(
          data.error === "has_sales"
            ? tForm("deleteHasSales")
            : tForm("deleteFailed"),
          "error"
        );
        return;
      }
      showToast(tForm("deleted"), "success");
      setShowDelete(false);
      router.refresh();
    } catch {
      showToast(tErr("network"), "error");
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <div className={styles.wrap} ref={wrapRef}>
      <button
        type="button"
        className={styles.trigger}
        onClick={() => setMenuOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        aria-label={t("menuLabel")}
      >
        <MoreIcon size={20} />
      </button>

      {menuOpen ? (
        <div className={styles.menu} role="menu">
          <Link
            href={`/${userSlug}/c/${offeringSlug}`}
            className={styles.item}
            role="menuitem"
            onClick={closeMenu}
          >
            <EyeIcon size={16} />
            {t("view")}
          </Link>
          <Link
            href={`/orders?course=${offeringSlug}`}
            className={styles.item}
            role="menuitem"
            onClick={closeMenu}
          >
            <ShoppingBagIcon size={16} />
            {t("seeOrders")}
          </Link>
          <Link
            href={`/my-courses/${offeringSlug}/edit`}
            className={styles.item}
            role="menuitem"
            onClick={closeMenu}
          >
            <PencilIcon size={16} />
            {t("edit")}
          </Link>
          {type === "code" ? (
            <button
              type="button"
              className={styles.item}
              role="menuitem"
              onClick={() => {
                setMenuOpen(false);
                setShowCodes(true);
              }}
            >
              <KeyIcon size={16} />
              {t("mintCodes")}
            </button>
          ) : null}

          <div className={styles.divider} role="separator" />

          <button
            type="button"
            className={styles.item}
            role="menuitem"
            onClick={() => {
              setMenuOpen(false);
              setShowArchive(true);
            }}
          >
            <ArchiveIcon size={16} />
            {t("archive")}
          </button>
          <button
            type="button"
            className={`${styles.item} ${styles.itemDanger}`}
            role="menuitem"
            disabled={hasSales}
            title={hasSales ? t("deleteHasSalesHint") : undefined}
            onClick={() => {
              setMenuOpen(false);
              setShowDelete(true);
            }}
          >
            <TrashIcon size={16} />
            {t("delete")}
          </button>
        </div>
      ) : null}

      {showArchive ? (
        <ConfirmDialog
          title={tForm("archiveConfirmTitle")}
          message={tForm("archiveConfirm")}
          confirmLabel={tForm("archiveConfirmCta")}
          cancelLabel={tCommon("cancel")}
          variant="danger"
          loading={isArchiving}
          onConfirm={handleArchive}
          onClose={() => setShowArchive(false)}
        />
      ) : null}

      {showDelete ? (
        <ConfirmDialog
          title={tForm("deleteConfirmTitle")}
          message={tForm("deleteConfirm")}
          confirmLabel={tForm("deleteConfirmCta")}
          cancelLabel={tCommon("cancel")}
          variant="danger"
          loading={isDeleting}
          onConfirm={handleDelete}
          onClose={() => setShowDelete(false)}
        />
      ) : null}

      {showCodes ? (
        <CodePoolModal
          offeringId={offeringId}
          offeringSlug={offeringSlug}
          initialRemaining={codeRemaining}
          onClose={() => setShowCodes(false)}
        />
      ) : null}
    </div>
  );
}

export default CourseRowActions;
