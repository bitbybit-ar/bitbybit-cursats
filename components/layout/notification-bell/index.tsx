"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { BellIcon } from "@/components/icons";
import { useClickOutside } from "@/lib/hooks/useClickOutside";
import { useNotificationsContext } from "@/lib/contexts/notifications-context";
import { cn } from "@/lib/utils";
import { NotificationList } from "./notification-list";
import styles from "./notification-bell.module.scss";

interface NotificationBellProps {
  className?: string;
}

export function NotificationBell({ className }: NotificationBellProps) {
  const t = useTranslations("notifications");
  const { notifications, unreadCount, authenticated, markAsRead, markAllRead } =
    useNotificationsContext();
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useClickOutside(wrapperRef, () => setOpen(false), open);

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
          <NotificationList
            notifications={notifications}
            unreadCount={unreadCount}
            onMarkAsRead={markAsRead}
            onMarkAllRead={markAllRead}
            onActivate={() => setOpen(false)}
          />
        </div>
      )}
    </div>
  );
}

export default NotificationBell;
