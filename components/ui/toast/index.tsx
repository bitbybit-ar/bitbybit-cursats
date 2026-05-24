"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
} from "react";
import { CheckIcon, BoltIcon } from "@/components/icons";
import { cn } from "@/lib/utils";
import styles from "./toast.module.scss";

type ToastType = "success" | "error" | "info";

interface ToastItem {
  id: string;
  message: string;
  type: ToastType;
  exiting?: boolean;
}

interface ToastContextValue {
  showToast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return ctx;
}

function ToastIcon({ type }: { type: ToastType }) {
  switch (type) {
    case "success":
      return <CheckIcon size={16} />;
    case "error":
      return <span style={{ fontSize: 14, fontWeight: 700 }}>&#x2715;</span>;
    case "info":
      return <BoltIcon size={16} />;
  }
}

function getToastTypeClass(type: ToastType): string {
  switch (type) {
    case "success":
      return styles.toastSuccess;
    case "error":
      return styles.toastError;
    case "info":
      return styles.toastInfo;
  }
}

const TOAST_DURATION_MS = 3000;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const counterRef = useRef(0);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map()
  );

  // Arm (or re-arm) the auto-dismiss timer for a toast, tracking it by id so
  // hover handlers can pause and resume it. Clearing any existing timer first
  // keeps this idempotent — a second call never orphans a live timer.
  const scheduleDismiss = useCallback((id: string) => {
    const existing = timersRef.current.get(id);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      timersRef.current.delete(id);
      setToasts((prev) =>
        prev.map((t) => (t.id === id ? { ...t, exiting: true } : t))
      );
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 300);
    }, TOAST_DURATION_MS);
    timersRef.current.set(id, timer);
  }, []);

  const pauseDismiss = useCallback((id: string) => {
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
  }, []);

  const showToast = useCallback(
    (message: string, type: ToastType = "info") => {
      const id = `toast-${++counterRef.current}`;
      setToasts((prev) => [...prev, { id, message, type }]);
      scheduleDismiss(id);
    },
    [scheduleDismiss]
  );

  // Clear any pending timers if the provider unmounts.
  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach((timer) => clearTimeout(timer));
      timers.clear();
    };
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className={styles.toastContainer} aria-live="polite" role="status">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={cn(
              styles.toast,
              getToastTypeClass(toast.type),
              toast.exiting && styles.toastExiting
            )}
            onMouseEnter={() => pauseDismiss(toast.id)}
            onMouseLeave={() => {
              // Don't re-arm a toast that is already animating out.
              if (!toast.exiting) scheduleDismiss(toast.id);
            }}
          >
            <div className={styles.toastIcon}>
              <ToastIcon type={toast.type} />
            </div>
            <span className={styles.toastMessage}>{toast.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export default ToastProvider;
