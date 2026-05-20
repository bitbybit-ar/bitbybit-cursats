"use client";

import { cn } from "@/lib/utils";
import styles from "./bubble.module.scss";

type BubbleColor =
  | "blue"
  | "lime"
  | "green"
  | "red"
  | "pink"
  | "cyan"
  | "orange"
  | "gold";
type BubbleVariant = "solid" | "gradient" | "icon";
type BubbleAnimation = "float" | "drift" | "float-slow" | "none";

interface BubbleProps {
  size: number;
  color: BubbleColor;
  variant?: BubbleVariant;
  gradientTo?: BubbleColor;
  icon?: React.ReactNode;
  opacity?: number;
  position: { top?: string; left?: string; right?: string; bottom?: string };
  animation?: BubbleAnimation;
  delay?: number;
  className?: string;
}

const animationMap: Record<string, string> = {
  float: styles.float,
  drift: styles.drift,
  "float-slow": styles.floatSlow,
  none: "",
};

export function Bubble({
  size,
  color,
  variant = "solid",
  gradientTo,
  icon,
  opacity,
  position,
  animation = "float",
  delay = 0,
  className = "",
}: BubbleProps) {
  const animClass = animationMap[animation] || "";
  const variantClass =
    variant === "gradient"
      ? styles.gradient
      : variant === "icon"
        ? styles.icon
        : styles.solid;

  return (
    <div
      className={cn(
        styles.bubble,
        styles[color],
        variantClass,
        animClass,
        className
      )}
      data-gradient-to={variant === "gradient" ? gradientTo : undefined}
      style={{
        width: size,
        height: size,
        ...position,
        animationDelay: `${delay}s`,
        ...(opacity !== undefined
          ? ({
              "--bubble-custom-opacity": `${Math.round(opacity * 100)}%`,
            } as React.CSSProperties)
          : {}),
      }}
      aria-hidden="true"
    >
      {variant === "icon" && icon}
    </div>
  );
}
