"use client";

import { useRef, type ReactNode } from "react";
import {
  motion,
  useScroll,
  useTransform,
  useReducedMotion,
  type Variants,
} from "framer-motion";
import styles from "./step-section.module.scss";

interface StepSectionProps {
  /** 1-based step number, also the parallax numeral. */
  index: number;
  title: string;
  body: string;
  /** Decorative illustration for the Polaroid frame. */
  icon: ReactNode;
}

// Baked-in Polaroid tilt, varied per step so the cards read as
// pinned photos rather than a uniform stack.
const ROTATIONS = [-3, 2.5, -2];

/**
 * One full-height step section. Composes:
 *
 *  - Layer 2: a giant blocky numeral that parallaxes (scroll-linked
 *    `y`, slower than the page) behind the bubble. Decorative.
 *  - Layer 3: a bubble that inflates into view (spring scale), a
 *    Polaroid that fades/slides in slightly later, and the caption
 *    text revealing line-by-line via `staggerChildren`.
 *
 * Re-triggers every time it scrolls back into view
 * (`viewport.once: false`). The `<h2>` is always mounted and only
 * its opacity/transform animate — never conditionally rendered — so
 * the heading order is stable for assistive tech. Under
 * `prefers-reduced-motion` every layer collapses to a plain fade and
 * the parallax is pinned.
 */
export function StepSection({ index, title, body, icon }: StepSectionProps) {
  const reduceMotion = useReducedMotion();
  const sectionRef = useRef<HTMLElement>(null);

  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start end", "end start"],
  });
  const numeralY = useTransform(
    scrollYProgress,
    [0, 1],
    reduceMotion ? [0, 0] : [-90, 90],
  );

  const rotate = reduceMotion ? 0 : ROTATIONS[(index - 1) % ROTATIONS.length];

  const bubbleV: Variants = reduceMotion
    ? { hidden: { opacity: 0 }, visible: { opacity: 1 } }
    : {
        hidden: { opacity: 0, scale: 0.3 },
        visible: {
          opacity: 1,
          scale: 1,
          transition: { type: "spring", stiffness: 60, damping: 14 },
        },
      };

  const polaroidV: Variants = reduceMotion
    ? { hidden: { opacity: 0 }, visible: { opacity: 1 } }
    : {
        hidden: { opacity: 0, y: 40, rotate },
        visible: {
          opacity: 1,
          y: 0,
          rotate,
          transition: { delay: 0.2, duration: 0.5, ease: "easeOut" },
        },
      };

  const captionV: Variants = {
    hidden: {},
    visible: {
      transition: {
        delayChildren: reduceMotion ? 0 : 0.45,
        staggerChildren: reduceMotion ? 0 : 0.08,
      },
    },
  };

  const lineV: Variants = reduceMotion
    ? { hidden: { opacity: 0 }, visible: { opacity: 1 } }
    : {
        hidden: { opacity: 0, y: 12 },
        visible: {
          opacity: 1,
          y: 0,
          transition: { duration: 0.4, ease: "easeOut" },
        },
      };

  return (
    <section ref={sectionRef} className={styles.section}>
      <motion.span
        className={styles.numeral}
        style={{ y: numeralY }}
        aria-hidden="true"
      >
        {index}
      </motion.span>

      <motion.div
        className={styles.bubble}
        variants={bubbleV}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: false, amount: 0.5 }}
      >
        <motion.div className={styles.polaroid} variants={polaroidV}>
          <div className={styles.frame} role="img" aria-label={title}>
            <span className={styles.icon} aria-hidden="true">
              {icon}
            </span>
          </div>
          <motion.div className={styles.caption} variants={captionV}>
            <motion.h2 className={styles.title} variants={lineV}>
              {title}
            </motion.h2>
            <motion.p className={styles.body} variants={lineV}>
              {body}
            </motion.p>
          </motion.div>
        </motion.div>
      </motion.div>
    </section>
  );
}

export default StepSection;
