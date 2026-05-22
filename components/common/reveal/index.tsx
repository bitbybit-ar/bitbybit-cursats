"use client";

import { motion, useReducedMotion, type Variants } from "framer-motion";
import type { ReactNode } from "react";

type Props = {
  className?: string;
  children: ReactNode;
  viewportMargin?: string;
  delay?: number;
};

/**
 * Single-unit scroll reveal: fades + rises its children with a blur
 * clear once they enter the viewport. Shares the blur-clear rhythm of
 * the landing section headers. Fires once and respects
 * `prefers-reduced-motion` (opacity-only fallback).
 */
export function Reveal({
  className,
  children,
  viewportMargin = "-15% 0px",
  delay = 0,
}: Props) {
  const reduceMotion = useReducedMotion();

  const variants: Variants = {
    hidden: {
      opacity: 0,
      y: reduceMotion ? 0 : 24,
      filter: reduceMotion ? "blur(0px)" : "blur(10px)",
    },
    visible: {
      opacity: 1,
      y: 0,
      filter: "blur(0px)",
      transition: {
        duration: 1.0,
        ease: [0.22, 1, 0.36, 1],
        delay: reduceMotion ? 0 : delay,
      },
    },
  };

  return (
    <motion.div
      className={className}
      variants={variants}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: viewportMargin }}
    >
      {children}
    </motion.div>
  );
}

export default Reveal;
