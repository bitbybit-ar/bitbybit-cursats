"use client";

import { useCallback, useEffect, useState } from "react";
import type { NotificationDTO } from "@/lib/schemas/notifications";

const POLL_MS = 30_000;

export interface UseNotificationsResult {
  notifications: NotificationDTO[];
  unreadCount: number;
  /** `false` once the API answers 401 — callers hide their UI. */
  authenticated: boolean;
  markAsRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
}

/**
 * Shared notification state: visibility-aware polling of
 * `/api/notifications` plus optimistic mark-as-read. Backs both the
 * desktop navbar dropdown (`NotificationBell`) and the mobile drawer
 * panel so they share one fetch/poll path.
 *
 * Pass `enabled = false` (e.g. for a logged-out viewer) to skip polling
 * entirely instead of hammering the endpoint for 401s.
 */
export function useNotifications(enabled = true): UseNotificationsResult {
  const [notifications, setNotifications] = useState<NotificationDTO[]>([]);
  const [authenticated, setAuthenticated] = useState(true);

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
      setAuthenticated(true);
    } catch {
      // Polling — transient errors are fine, retry next tick.
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
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
  }, [enabled, fetchNotifications]);

  const markAsRead = useCallback(async (id: string) => {
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
  }, []);

  const markAllRead = useCallback(async () => {
    setNotifications((prev) => {
      const now = new Date().toISOString();
      return prev.map((n) => ({ ...n, read_at: n.read_at ?? now }));
    });
    try {
      await fetch("/api/notifications", { method: "POST" });
    } catch {
      // Next poll resyncs.
    }
  }, []);

  const unreadCount = notifications.filter((n) => !n.read_at).length;

  return { notifications, unreadCount, authenticated, markAsRead, markAllRead };
}
