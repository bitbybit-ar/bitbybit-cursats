"use client";

import { motion, useReducedMotion, type Variants } from "framer-motion";
import { Children, type ReactNode } from "react";

type Props = {
  className?: string;
  children: ReactNode;
};

export function RevealGrid({ className, children }: Props) {
  const reduceMotion = useReducedMotion();

  const container: Variants = {
    hidden: {},
    visible: {
      transition: {
        staggerChildren: reduceMotion ? 0 : 0.13,
        delayChildren: reduceMotion ? 0 : 0.1,
      },
    },
  };

  const card: Variants = {
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
