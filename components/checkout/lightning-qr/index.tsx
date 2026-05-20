"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { QRCodeSVG } from "qrcode.react";
import { Button } from "@/components/ui/button";
import { CopyIcon, CheckIcon } from "@/components/icons";
import styles from "./lightning-qr.module.scss";

interface LightningQRProps {
  bolt11: string;
}

export function LightningQR({ bolt11 }: LightningQRProps) {
  const t = useTranslations("checkout");
  const [isCopied, setIsCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(bolt11);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch {
      // Clipboard API unavailable (e.g. insecure context). Surface
      // the raw string in the textarea below; the user can copy
      // manually.
    }
  }

  // Lightning wallets recognise BOLT11 invoices in either upper or
  // lower case; uppercase compresses better in QR codes (alphanumeric
  // mode vs. byte mode), shrinking the matrix and improving
  // readability under camera shake.
  const qrPayload = bolt11.toUpperCase();

  return (
    <div className={styles.wrap}>
      <div className={styles.qrFrame}>
        <QRCodeSVG
          value={qrPayload}
          size={280}
          level="M"
          marginSize={2}
          className={styles.qr}
        />
      </div>

      <div className={styles.invoiceBox}>
        <code className={styles.invoiceText}>{bolt11}</code>
      </div>

      <Button variant="ghost" size="default" onClick={handleCopy} fullWidth>
        {isCopied ? <CheckIcon size={16} /> : <CopyIcon size={16} />}
        {isCopied ? t("copied") : t("copyInvoice")}
      </Button>
    </div>
  );
}

export default LightningQR;
