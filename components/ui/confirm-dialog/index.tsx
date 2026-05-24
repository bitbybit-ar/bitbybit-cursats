"use client";

import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import styles from "./confirm-dialog.module.scss";

interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onClose: () => void;
  /** Visual weight of the confirm button. Defaults to a destructive action. */
  variant?: "danger" | "primary";
  /** Disables both buttons while the confirmed action is in flight. */
  loading?: boolean;
}

/**
 * Platform-styled replacement for `window.confirm`. Wraps the generic
 * Modal with a message and a Cancel / Confirm button pair so a
 * destructive action (archive, delete) gets a branded prompt instead
 * of the browser-native dialog. The caller owns the async work and
 * toggles `loading` while it runs.
 */
export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onClose,
  variant = "danger",
  loading = false,
}: ConfirmDialogProps) {
  return (
    <Modal onClose={onClose} title={title} size="sm">
      <p className={styles.message}>{message}</p>
      <div className={styles.actions}>
        <Button
          type="button"
          variant="secondary"
          onClick={onClose}
          disabled={loading}
        >
          {cancelLabel}
        </Button>
        <Button
          type="button"
          variant={variant}
          onClick={onConfirm}
          disabled={loading}
        >
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}

export default ConfirmDialog;