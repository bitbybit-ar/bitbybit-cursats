"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/routing";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

/**
 * Seller-facing "sync my orders" action on /orders. POSTs to
 * `/api/orders/sync`, which runs the Wapu settlement sweep scoped to
 * the signed-in seller — the same passes as the daily cron, on demand
 * (Vercel Hobby caps crons at once a day). Refreshes the list on
 * success so any newly-confirmed deposit or released payout shows.
 */
export function SyncOrdersButton() {
  const t = useTranslations("orders");
  const tErr = useTranslations("errors");
  const router = useRouter();
  const { showToast } = useToast();
  const [isSyncing, setIsSyncing] = useState(false);

  async function handleSync() {
    if (isSyncing) return;
    setIsSyncing(true);
    try {
      const res = await fetch("/api/orders/sync", { method: "POST" });
      if (!res.ok) {
        if (res.status === 401) {
          router.push("/");
          return;
        }
        showToast(t("syncFailed"), "error");
        return;
      }
      showToast(t("syncDone"), "success");
      router.refresh();
    } catch {
      showToast(tErr("network"), "error");
    } finally {
      setIsSyncing(false);
    }
  }

  return (
    <Button
      type="button"
      variant="secondary"
      onClick={handleSync}
      disabled={isSyncing}
    >
      {isSyncing ? t("syncing") : t("sync")}
    </Button>
  );
}

export default SyncOrdersButton;
