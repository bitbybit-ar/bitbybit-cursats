import { cn } from "@/lib/utils";
import styles from "./block.module.scss";

type BlockSize = "tiny" | "small" | "medium" | "large";
type BlockColor = "blue" | "lime" | "green" | "red" | "pink";

interface BlockProps {
  size?: BlockSize;
  color: BlockColor;
  animation?: "drop" | "pulse" | "none";
  delay?: number;
  flat?: boolean;
  className?: string;
  children?: React.ReactNode;
}

export function Block({
  size = "medium",
  color,
  animation = "none",
  delay = 0,
  flat = false,
  className = "",
  children,
}: BlockProps) {
  const animClass =
    animation === "drop"
      ? styles.drop
      : animation === "pulse"
        ? styles.pulse
        : "";

  return (
    <div
      className={cn(
        styles.block,
        styles[size],
        styles[color],
        animClass,
        flat && styles.flat,
        className
      )}
      style={{ animationDelay: `${delay}s` }}
      aria-hidden="true"
    >
      {children}
    </div>
  );
}
