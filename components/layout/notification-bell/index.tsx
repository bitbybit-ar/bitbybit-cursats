"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Link } from "@/i18n/routing";
import { BellIcon } from "@/components/icons";
import { useClickOutside } from "@/lib/hooks/useClickOutside";
import { cn } from "@/lib/utils";
import type { NotificationDTO } from "@/lib/schemas/notifications";
import styles from "./notification-bell.module.scss";

const POLL_MS = 30_000;

interface NotificationBellProps {
  className?: string;
}

interface NotificationCopy {
  title: string;
  body: string;
}

function notificationCopy(
  t: (key: string, vars?: Record<string, string | number>) => string,
  n: NotificationDTO
): NotificationCopy {
  const payload = (n.payload ?? {}) as Record<string, unknown>;
  const offering =
    typeof payload.offering_title === "string" ? payload.offering_title : "";
  // Use a separate try/catch per key so a missing body key doesn't blank
  // the title (and vice versa).
  let title: string;
  let body: string;
  try {
    title = t(`types.${n.kind}.title`, { offering });
  } catch {
    title = n.kind;
  }
  try {
    body = t(`types.${n.kind}.body`, { offering });
  } catch {
    body = "";
  }
  return { title, body };
}

function notificationHref(n: NotificationDTO): string | null {
  const payload = (n.payload ?? {}) as Record<string, unknown>;
  const orderId =
    typeof payload.order_id === "string" ? payload.order_id : null;
  if (!orderId) return null;
  return n.kind === "order.paid" ? `/receipt/${orderId}` : null;
}

export function NotificationBell({ className }: NotificationBellProps) {
  const t = useTranslations("notifications");
  const locale = useLocale();
  const [notifications, setNotifications] = useState<NotificationDTO[]>([]);
  const [authenticated, setAuthenticated] = useState(true);
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const unreadCount = notifications.filter((n) => !n.read_at).length;

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications");
      if (res.status === 401) {
        setAuthenticated(false);
        return;
      }
      if (!res.ok) return;
      const json = (await res.json()) as { data?: NotificationDTO[] };
      setNotifications(json.data ?? []);
    } catch {
      // Polling — transient errors are fine, retry next tick.
    }
  }, []);

  useEffect(() => {
    // Pause polling when the tab is hidden; resume with an immediate
    // catch-up fetch when it becomes visible.
    let interval: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (interval) return;
      fetchNotifications();
      interval = setInterval(fetchNotifications, POLL_MS);
    };
    const stop = () => {
      if (!interval) return;
      clearInterval(interval);
      interval = null;
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") start();
      else stop();
    };

    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [fetchNotifications]);

  useClickOutside(wrapperRef, () => setOpen(false), open);

  const markAsRead = async (id: string) => {
    setNotifications((prev) =>
      prev.map((n) =>
        n.id === id ? { ...n, read_at: new Date().toISOString() } : n
      )
    );
    try {
      await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
    } catch {
      // Next poll resyncs.
    }
  };

  const markAllRead = async () => {
    if (unreadCount === 0) return;
    const now = new Date().toISOString();
    setNotifications((prev) =>
      prev.map((n) => ({ ...n, read_at: n.read_at ?? now }))
    );
    try {
      await fetch("/api/notifications", { method: "POST" });
    } catch {
      // Next poll resyncs.
    }
  };

  if (!authenticated) return null;

  return (
    <div className={cn(styles.wrapper, className)} ref={wrapperRef}>
      <button
        type="button"
        className={styles.bell}
        onClick={() => setOpen((v) => !v)}
        aria-label={t("ariaLabel")}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <BellIcon size={18} />
        {unreadCount > 0 && (
          <span className={styles.badge} aria-hidden="true">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          className={styles.dropdown}
          role="dialog"
          aria-label={t("ariaLabel")}
        >
          <div className={styles.header}>
            <span className={styles.count}>
              {t("unreadCount", { count: unreadCount })}
            </span>
            {unreadCount > 0 && (
              <button
                type="button"
                className={styles.markAll}
                onClick={markAllRead}
              >
                {t("markAllRead")}
              </button>
            )}
          </div>

          {notifications.length === 0 ? (
            <p className={styles.empty}>{t("empty")}</p>
          ) : (
            <ul className={styles.list}>
              {notifications.map((n) => {
                const { title, body } = notificationCopy(t, n);
                const href = notificationHref(n);
                const itemClass = cn(
                  styles.itemButton,
                  n.read_at ? styles.read : styles.unread
                );
                const onActivate = () => {
                  if (!n.read_at) markAsRead(n.id);
                  setOpen(false);
                };
                const content = (
                  <>
                    <strong className={styles.title}>{title}</strong>
                    {body && <p className={styles.body}>{body}</p>}
                    <time className={styles.time} dateTime={n.created_at}>
                      {new Date(n.created_at).toLocaleString(locale)}
                    </time>
                  </>
                );
                return (
                  <li key={n.id} className={styles.item}>
                    {href ? (
                      <Link
                        href={href}
                        className={itemClass}
                        onClick={onActivate}
                      >
                        {content}
                      </Link>
                    ) : (
                      <button
                        type="button"
                        className={itemClass}
                        onClick={onActivate}
                      >
                        {content}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export default NotificationBell;
