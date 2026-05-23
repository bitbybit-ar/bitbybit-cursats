"use client";

import { motion, useReducedMotion, type Variants } from "framer-motion";
import { Children, type ReactNode } from "react";
import { useIsMobileViewport } from "@/lib/hooks/useIsMobileViewport";

type Props = {
  className?: string;
  children: ReactNode;
};

export function RevealGrid({ className, children }: Props) {
  const reduceMotion = useReducedMotion();
  // The desktop horizontal slide-in (x: -90) clips and reads as cramped
  // on a single-column phone layout, so the narrow (phone) layout gets
  // a gentle fade-up with a tighter stagger instead. Gated on viewport
  // width — not pointer type — so tablets and small laptops get the
  // same slide-in as desktop, matching the deck/journey animations.
  const isMobile = useIsMobileViewport();

  const container: Variants = {
    hidden: {},
    visible: {
      transition: {
        staggerChildren: reduceMotion ? 0 : isMobile ? 0.08 : 0.13,
        delayChildren: reduceMotion ? 0 : 0.1,
      },
    },
  };

  const card: Variants = isMobile
    ? {
        hidden: { opacity: 0, y: reduceMotion ? 0 : 16 },
        visible: {
          opacity: 1,
          y: 0,
          transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] },
        },
      }
    : {
        hidden: {
          opacity: 0,
          x: reduceMotion ? 0 : -90,
          filter: reduceMotion ? "blur(0px)" : "blur(6px)",
        },
        visible: {
          opacity: 1,
          x: 0,
          filter: "blur(0px)",
          transition: { duration: 0.9, ease: [0.22, 1, 0.36, 1] },
        },
      };

  return (
    <motion.div
      className={className}
      variants={container}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-10% 0px" }}
    >
      {Children.map(children, (child, i) => (
        <motion.div key={i} variants={card} style={{ height: "100%" }}>
          {child}
        </motion.div>
      ))}
    </motion.div>
  );
}
