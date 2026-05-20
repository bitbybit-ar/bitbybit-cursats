"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/routing";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { BoltIcon } from "@/components/icons";

interface BuyButtonProps {
  offeringId: string;
  /** True when the offering has no available codes left. */
  soldOut?: boolean;
}

interface CheckoutResponse {
  order_id: string;
}

export function BuyButton({ offeringId, soldOut = false }: BuyButtonProps) {
  const t = useTranslations("offering");
  const tErrors = useTranslations("errors");
  const router = useRouter();
  const { showToast } = useToast();
  const [isPending, setIsPending] = useState(false);
  const [, startTransition] = useTransition();

  async function handleClick() {
    if (isPending || soldOut) return;
    setIsPending(true);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ offering_id: offeringId }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
          reason?: string;
        };
        // 409 with reason=offering_sold_out happens when the pool
        // emptied between page load and click (race against
        // another buyer). Toast a specific message and bail —
        // re-rendering will show the page's sold-out state on
        // next nav.
        if (data.reason === "offering_sold_out") {
          showToast(tErrors("offeringSoldOut"), "error");
        } else if (
          res.status === 404 ||
          data.error === "offering_unavailable"
        ) {
          showToast(tErrors("offeringUnavailable"), "error");
        } else {
          showToast(tErrors("checkoutFailed"), "error");
        }
        return;
      }
      const data = (await res.json()) as CheckoutResponse;
      startTransition(() => {
        router.push(`/checkout/${data.order_id}`);
      });
    } catch {
      showToast(tErrors("network"), "error");
    } finally {
      setIsPending(false);
    }
  }

  return (
    <Button
      variant="accent"
      size="lg"
      fullWidth
      onClick={handleClick}
      disabled={isPending || soldOut}
    >
      <BoltIcon size={20} />
      {soldOut ? t("soldOut") : isPending ? t("buying") : t("buy")}
    </Button>
  );
}

export default BuyButton;
