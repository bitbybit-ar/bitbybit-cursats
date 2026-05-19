"use client";

import type { ReactNode } from "react";
import { motion, useReducedMotion, type Variants } from "framer-motion";
import { Polaroid } from "@/components/ui/polaroid";
import {
  BookIcon,
  QrIcon,
  CheckIcon,
  KeyIcon,
  CoinIcon,
  ShoppingBagIcon,
} from "@/components/icons";
import styles from "./journey-steps.module.scss";

type Variant = "buyer" | "teacher";

interface Step {
  title: string;
  body: string;
}

interface JourneyStepsProps {
  /** Picks the icon set; also used for stable keys. */
  variant: Variant;
  /** Section heading ("Si comprás un curso" / "Si enseñás algo"). */
  title: string;
  steps: Step[];
}

// Icons can't cross the server→client prop boundary as components, so
// the mapping lives here. Order matches the step order: buyer =
// browse → pay with Lightning → receive; teacher = sign in with
// Nostr → set payout → publish & sell.
const ICONS: Record<Variant, ReactNode[]> = {
  buyer: [
    <BookIcon key="b1" size={72} />,
    <QrIcon key="b2" size={72} />,
    <CheckIcon key="b3" size={72} />,
  ],
  teacher: [
    <KeyIcon key="t1" size={72} />,
    <CoinIcon key="t2" size={72} />,
    <ShoppingBagIcon key="t3" size={72} />,
  ],
};

const POLAROID_ROTATION = ["left", "right", "left"] as const;

/**
 * One journey: a section heading plus three reused
 * `<Polaroid>` cards in a row (column on mobile). The row reveals
 * with a `whileInView` stagger — view-triggered, not scroll-scrubbed,
 * so it appears reliably on the first scroll regardless of direction.
 * `prefers-reduced-motion` collapses the reveal to a plain fade.
 */
export function JourneySteps({ variant, title, steps }: JourneyStepsProps) {
  const reduceMotion = useReducedMotion() ?? false;

  const list: Variants = {
    hidden: {},
    visible: {
      transition: {
        delayChildren: 0.05,
        staggerChildren: reduceMotion ? 0 : 0.12,
      },
    },
  };

  const card: Variants = reduceMotion
    ? { hidden: { opacity: 0 }, visible: { opacity: 1 } }
    : {
        hidden: { opacity: 0, y: 28, scale: 0.96 },
        visible: {
          opacity: 1,
          y: 0,
          scale: 1,
          transition: { type: "spring", stiffness: 90, damping: 16 },
        },
      };

  return (
    <section className={styles.section}>
      <div className={styles.inner}>
        <h2 className={styles.title}>{title}</h2>

        <motion.ol
          className={styles.grid}
          variants={list}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.2 }}
        >
          {steps.map((step, i) => (
            <motion.li
              key={`${variant}-${i}`}
              className={styles.card}
              variants={card}
            >
              <span className={styles.badge} aria-hidden="true">
                {i + 1}
              </span>
              <Polaroid
                rotation={POLAROID_ROTATION[i % POLAROID_ROTATION.length]}
                frame={
                  <span className={styles.icon} aria-hidden="true">
                    {ICONS[variant][i]}
                  </span>
                }
              >
                <h3>{step.title}</h3>
                <p>{step.body}</p>
              </Polaroid>
            </motion.li>
          ))}
        </motion.ol>
      </div>
    </section>
  );
}

export default JourneySteps;
