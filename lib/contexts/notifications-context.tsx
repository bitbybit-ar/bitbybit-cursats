"use client";

import { createContext, useContext, type ReactNode } from "react";
import {
  useNotifications,
  type UseNotificationsResult,
} from "@/lib/hooks/useNotifications";

const NotificationsContext = createContext<UseNotificationsResult | null>(null);

/**
 * Runs the notification poll exactly once and shares it with every
 * consumer (the navbar bell + the mobile drawer panel), so the app
 * keeps a single `/api/notifications` poller instead of one per bell
 * instance. `enabled` gates polling on an authenticated session.
 */
export function NotificationsProvider({
  enabled,
  children,
}: {
  enabled: boolean;
  children: ReactNode;
}) {
  const value = useNotifications(enabled);
  return (
    <NotificationsContext.Provider value={value}>
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotificationsContext(): UseNotificationsResult {
  const ctx = useContext(NotificationsContext);
  if (!ctx) {
    throw new Error(
      "useNotificationsContext must be used within a NotificationsProvider"
    );
  }
  return ctx;
}
