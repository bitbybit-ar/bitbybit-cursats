"use client";

import { motion, useReducedMotion, type Variants } from "framer-motion";
import { Children, type ReactNode } from "react";

type Props = {
  className?: string;
  itemClassName?: string;
  ariaLabel?: string;
  children: ReactNode;
  viewportMargin?: string;
  delay?: number;
};

const TILTS = [-8, 6, -5, 7, -6, 5];

export function RevealPolaroids({
  className,
  itemClassName,
  ariaLabel,
  children,
  viewportMargin = "-10% 0px",
  delay = 0,
}: Props) {
  const reduceMotion = useReducedMotion();

  const container: Variants = {
    hidden: {},
    visible: {
      transition: {
        staggerChildren: reduceMotion ? 0 : 0.22,
        delayChildren: reduceMotion ? 0 : 0.15 + delay,
      },
    },
  };

  return (
    <motion.ul
      className={className}
      aria-label={ariaLabel}
      variants={container}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: viewportMargin }}
    >
      {Children.map(children, (child, i) => {
        const tilt = TILTS[i % TILTS.length];
        const polaroid: Variants = {
          hidden: {
            opacity: 0,
            y: reduceMotion ? 0 : -70,
            rotate: reduceMotion ? 0 : tilt,
            scale: reduceMotion ? 1 : 0.92,
            filter: reduceMotion ? "blur(0px)" : "blur(4px)",
          },
          visible: {
            opacity: 1,
            y: 0,
            rotate: 0,
            scale: 1,
            filter: "blur(0px)",
            transition: {
              type: "spring",
              stiffness: 110,
              damping: 14,
              mass: 1.1,
            },
          },
        };
        return (
          <motion.li key={i} className={itemClassName} variants={polaroid}>
            {child}
          </motion.li>
        );
      })}
    </motion.ul>
  );
}

export default RevealPolaroids;
