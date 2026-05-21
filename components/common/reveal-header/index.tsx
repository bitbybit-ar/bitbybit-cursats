"use client";

import { motion, useReducedMotion, type Variants } from "framer-motion";
import type { ReactNode } from "react";

type Props = {
  className?: string;
  title: ReactNode;
  subtitle: ReactNode;
  titleClassName?: string;
  subtitleClassName?: string;
  viewportMargin?: string;
};

export function RevealHeader({
  className,
  title,
  subtitle,
  titleClassName,
  subtitleClassName,
  viewportMargin = "-15% 0px",
}: Props) {
  const reduceMotion = useReducedMotion();

  const container: Variants = {
    hidden: {},
    visible: {
      transition: {
        staggerChildren: reduceMotion ? 0 : 0.2,
        delayChildren: reduceMotion ? 0 : 0.05,
      },
    },
  };

  const item: Variants = {
    hidden: {
      opacity: 0,
      filter: reduceMotion ? "blur(0px)" : "blur(14px)",
    },
    visible: {
      opacity: 1,
      filter: "blur(0px)",
      transition: { duration: 1.2, ease: [0.22, 1, 0.36, 1] },
    },
  };

  return (
    <motion.header
      className={className}
      variants={container}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: viewportMargin }}
    >
      <motion.h2 className={titleClassName} variants={item}>
        {title}
      </motion.h2>
      <motion.p className={subtitleClassName} variants={item}>
        {subtitle}
      </motion.p>
    </motion.header>
  );
}

export default RevealHeader;
