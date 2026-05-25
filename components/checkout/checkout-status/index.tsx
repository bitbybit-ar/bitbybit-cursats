"use client";

import { useEffect, useState, useRef } from "react";
import { useTranslations } from "next-intl";
import { useRouter, Link } from "@/i18n/routing";
import styles from "./checkout-status.module.scss";

interface CheckoutStatusProps {
  orderId: string;
  /** Initial status from the server render. */
  initialStatus: "pending" | "paid" | "failed" | "refunded";
  /** Unix seconds — when the BOLT11 invoice expires. */
  expiresAt: number;
  /** Storefront URL of the course, for the "back to the course" CTA. */
  courseHref: string;
}

interface OrderStatusResponse {
  order_id: string;
  status: "pending" | "paid" | "failed" | "refunded";
  paid_at: string | null;
  /**
   * Server hint for how long to wait before the next poll. Varies by
   * rail (NWC polls less often — each poll opens a relay connection).
   * Falls back to POLL_INTERVAL_MS when absent.
   */
  poll_after_ms?: number;
}

const POLL_INTERVAL_MS = 3000;

export function CheckoutStatus({
  orderId,
  initialStatus,
  expiresAt,
  courseHref,
}: CheckoutStatusProps) {
  const t = useTranslations("checkout");
  const router = useRouter();
  const [status, setStatus] = useState(initialStatus);
  const [secondsLeft, setSecondsLeft] = useState(() =>
    Math.max(0, expiresAt - Math.floor(Date.now() / 1000))
  );
  const stoppedRef = useRef(false);

  useEffect(() => {
    if (status === "paid") {
      router.replace(`/receipt/${orderId}`);
      return;
    }
    if (status === "failed" || status === "refunded") return;

    stoppedRef.current = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    // Self-scheduling poll: the next request is queued only after the
    // current one resolves, so a slow upstream (e.g. an NWC relay
    // round-trip) can never stack overlapping requests. The server
    // tells us how long to wait via `poll_after_ms` (longer for NWC).
    async function tick() {
      if (stoppedRef.current) return;
      let nextDelay = POLL_INTERVAL_MS;
      try {
        const res = await fetch(`/api/orders/${orderId}`, {
          cache: "no-store",
        });
        if (res.ok) {
          const data = (await res.json()) as OrderStatusResponse;
          if (
            typeof data.poll_after_ms === "number" &&
            data.poll_after_ms > 0
          ) {
            nextDelay = data.poll_after_ms;
          }
          setStatus(data.status);
        }
      } catch {
        // Transient — keep polling. The expiry tick below is the
        // hard stop.
      }
      if (!stoppedRef.current) {
        timer = setTimeout(tick, nextDelay);
      }
    }

    void tick();

    return () => {
      stoppedRef.current = true;
      if (timer) clearTimeout(timer);
    };
  }, [orderId, router, status]);

  useEffect(() => {
    const tick = setInterval(() => {
      setSecondsLeft((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(tick);
  }, []);

  const isExpired = secondsLeft <= 0 && status === "pending";
  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;
  const countdown = `${minutes}:${seconds.toString().padStart(2, "0")}`;

  if (isExpired) {
    return (
      <div className={styles.statusExpired}>
        <p className={styles.message}>{t("expired")}</p>
        <Link href={courseHref} className={styles.courseLink}>
          {t("expiredCta")}
        </Link>
      </div>
    );
  }

  if (status === "failed" || status === "refunded") {
    return (
      <div className={styles.statusFailed}>
        <p className={styles.message}>{t("status.failed")}</p>
        <Link href={courseHref} className={styles.courseLink}>
          {t("expiredCta")}
        </Link>
      </div>
    );
  }

  if (status === "paid") {
    return (
      <div className={styles.statusPaid}>
        <span className={styles.spinner} aria-hidden />
        <p className={styles.message}>{t("status.paid")}</p>
      </div>
    );
  }

  return (
    <div className={styles.statusWaiting}>
      <span className={styles.spinner} aria-hidden />
      <div className={styles.waitingText}>
        <p className={styles.message}>{t("status.waiting")}</p>
        <p className={styles.expires}>
          {t("expiresIn")} {countdown}
        </p>
      </div>
    </div>
  );
}

export default CheckoutStatus;
