import { cn } from "@/lib/utils";
import styles from "./wordmark.module.scss";

export interface WordmarkProps {
  className?: string;
}

// "CUR" in the active text color, "SATS" filled with the brand
// blue→lime→pink gradient (same hues as <LogoBlocks />). Font-size is
// inherited so each call-site controls its own display scale.
export function Wordmark({ className }: WordmarkProps) {
  return (
    <span className={cn(styles.wordmark, className)}>
      <span className={styles.primary}>CUR</span>
      <span className={styles.gradient}>SATS</span>
    </span>
  );
}

export default Wordmark;