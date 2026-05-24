"use client";

import { useTranslations, useLocale } from "next-intl";
import { Link } from "@/i18n/routing";
import { cn } from "@/lib/utils";
import type { NotificationDTO } from "@/lib/schemas/notifications";
import styles from "./notification-bell.module.scss";

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
  // Separate try/catch per key so a missing body key doesn't blank the
  // title (and vice versa).
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
  if (n.kind === "order.paid") return `/receipt/${orderId}`;
  // All seller-facing kinds (sale.received, payout.pending/released/failed)
  // link to the seller's order detail.
  return `/orders/${orderId}`;
}

interface NotificationListProps {
  notifications: NotificationDTO[];
  unreadCount: number;
  onMarkAsRead: (id: string) => void;
  onMarkAllRead: () => void;
  /** Called after a notification is activated (e.g. close the popover). */
  onActivate?: () => void;
}

/**
 * Presentational header + list shared by the desktop dropdown
 * (`NotificationBell`) and the mobile drawer panel. State lives in the
 * `useNotifications` hook; this component only renders + signals intent.
 */
export function NotificationList({
  notifications,
  unreadCount,
  onMarkAsRead,
  onMarkAllRead,
  onActivate,
}: NotificationListProps) {
  const t = useTranslations("notifications");
  const locale = useLocale();

  return (
    <>
      <div className={styles.header}>
        <span className={styles.count}>
          {t("unreadCount", { count: unreadCount })}
        </span>
        {unreadCount > 0 && (
          <button
            type="button"
            className={styles.markAll}
            onClick={onMarkAllRead}
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
            const handleActivate = () => {
              if (!n.read_at) onMarkAsRead(n.id);
              onActivate?.();
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
                    onClick={handleActivate}
                  >
                    {content}
                  </Link>
                ) : (
                  <button
                    type="button"
                    className={itemClass}
                    onClick={handleActivate}
                  >
                    {content}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

export default NotificationList;
