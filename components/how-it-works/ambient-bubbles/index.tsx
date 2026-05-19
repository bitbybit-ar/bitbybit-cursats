"use client";

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { useMediaQuery } from "@/lib/hooks/useMediaQuery";
import styles from "./ambient-bubbles.module.scss";

interface BubbleConfig {
  id: number;
  leftVw: number;
  size: number;
  duration: number;
  delay: number;
  opacity: number;
  sway: number;
}

const DESKTOP_COUNT = 30;
const MOBILE_COUNT = 15;

function makeBubbles(count: number): BubbleConfig[] {
  return Array.from({ length: count }, (_, id) => ({
    id,
    leftVw: Math.random() * 100,
    size: 20 + Math.random() * 100, // 20–120px
    duration: 15 + Math.random() * 25, // 15–40s
    delay: -Math.random() * 40, // negative → field is mid-cycle on mount
    opacity: 0.05 + Math.random() * 0.15, // 0.05–0.2
    sway: 12 + Math.random() * 28, // px of horizontal drift
  }));
}

/**
 * Layer 1 — ambient bubble field. A `position: fixed`, full-viewport
 * decorative layer that sits behind every section (the page gives it
 * `z-index: 0`). Mounted once at the page root, never per section.
 *
 * Perf notes for mid-tier Android: only `transform` (x/y) animates —
 * size/position are static inline styles, opacity is static. The
 * count drops to 15 on small screens and the whole layer is removed
 * (returns `null`) under `prefers-reduced-motion`. Configs are
 * generated after mount so the server renders nothing (decorative)
 * and there is no hydration mismatch from `Math.random`.
 */
export function AmbientBubbles() {
  const reduceMotion = useReducedMotion();
  const isMobile = useMediaQuery("(max-width: 768px)");
  const count = isMobile ? MOBILE_COUNT : DESKTOP_COUNT;
  const [bubbles, setBubbles] = useState<BubbleConfig[]>([]);

  useEffect(() => {
    if (reduceMotion) {
      setBubbles([]);
      return;
    }
    setBubbles(makeBubbles(count));
  }, [count, reduceMotion]);

  if (reduceMotion || bubbles.length === 0) return null;

  return (
    <div className={styles.field} aria-hidden="true">
      {bubbles.map((b) => (
        <motion.div
          key={b.id}
          className={styles.bubble}
          style={{
            left: `${b.leftVw}vw`,
            width: b.size,
            height: b.size,
            opacity: b.opacity,
          }}
          initial={{ y: "110vh", x: 0 }}
          animate={{ y: "-10vh", x: [0, b.sway, -b.sway, 0] }}
          transition={{
            y: {
              duration: b.duration,
              ease: "linear",
              repeat: Infinity,
              repeatType: "loop",
              delay: b.delay,
            },
            x: {
              duration: b.duration / 2,
              ease: "easeInOut",
              repeat: Infinity,
              repeatType: "mirror",
              delay: b.delay,
            },
          }}
        />
      ))}
    </div>
  );
}

export default AmbientBubbles;
