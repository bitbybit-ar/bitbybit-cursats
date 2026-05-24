"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/routing";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { BoltIcon } from "@/components/icons";
import styles from "./buy-button.module.scss";

interface BuyButtonProps {
  offeringId: string;
  /**
   * Set when the signed-in buyer already has a paid order for this
   * offering. Renders a "Go to receipt" link beside "Buy again".
   */
  existingOrderId?: string;
  /** True when the offering has no available codes left. */
  soldOut?: boolean;
}

interface CheckoutResponse {
  order_id: string;
}

export function BuyButton({
  offeringId,
  existingOrderId,
  soldOut = false,
}: BuyButtonProps) {
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
          lightning_reason?: string;
          nwc_reason?: string;
        };
        // 409 with reason=offering_sold_out happens when the pool
        // emptied between page load and click (race against
        // another buyer). Toast a specific message and bail —
        // re-rendering will show the page's sold-out state on
        // next nav.
        if (data.reason === "offering_sold_out") {
          showToast(tErrors("offeringSoldOut"), "error");
        } else if (data.lightning_reason) {
          // The seller's LN provider rejected the mint. Be candid —
          // the buyer can't fix it, but knowing it's a seller-side
          // wallet problem (not the buyer's network) lets them
          // decide whether to retry or pick a different course.
          const lnKey: Record<string, string> = {
            invalid_address: "sellerLightningInvalidAddress",
            lnurl_unreachable: "sellerLightningUnreachable",
            lnurl_no_lud21: "sellerLightningNoLud21",
            lnurl_invalid_response: "sellerLightningMalformed",
            bolt11_no_payment_hash: "sellerLightningMalformed",
          };
          const key = lnKey[data.lightning_reason] ?? "offeringUnavailable";
          showToast(tErrors(key), "error");
        } else if (data.nwc_reason) {
          // The seller's wallet (NWC) couldn't mint the invoice —
          // usually it's offline. Candid, buyer-can't-fix messaging.
          const nwcKey: Record<string, string> = {
            unreachable: "sellerNwcUnreachable",
            make_invoice_failed: "sellerNwcUnreachable",
            lookup_failed: "sellerNwcUnreachable",
            invalid_uri: "sellerNwcUnavailable",
            unsupported: "sellerNwcUnavailable",
            no_payment_hash: "sellerNwcUnavailable",
          };
          const key = nwcKey[data.nwc_reason] ?? "offeringUnavailable";
          showToast(tErrors(key), "error");
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

  const buyAgain = (
    <Button
      variant="accent"
      size="lg"
      fullWidth
      onClick={handleClick}
      disabled={isPending || soldOut}
      className={existingOrderId ? styles.action : undefined}
    >
      <BoltIcon size={20} />
      {soldOut
        ? t("soldOut")
        : isPending
          ? t("buying")
          : existingOrderId
            ? t("buyAgain")
            : t("buy")}
    </Button>
  );

  if (!existingOrderId) return buyAgain;

  return (
    <div className={styles.actions}>
      <Button
        href={`/receipt/${existingOrderId}`}
        variant="outline"
        size="lg"
        fullWidth
        className={styles.action}
      >
        {t("goToReceipt")}
      </Button>
      {buyAgain}
    </div>
  );
}

export default BuyButton;
