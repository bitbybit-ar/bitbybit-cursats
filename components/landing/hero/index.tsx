"use client";

import { motion, useReducedMotion, type Variants } from "framer-motion";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { HeroBubbles } from "./hero-bubbles";
import styles from "./hero.module.scss";

const GRADIENT_RE = /^(.*?)<gradient>(.*?)<\/gradient>(.*)$/s;

function splitWords(text: string): string[] {
  return text.split(/(\s+)/).filter((chunk) => chunk.length > 0);
}

export function Hero() {
  const t = useTranslations("landing.hero");
  const reduceMotion = useReducedMotion();

  const rawTitle = t.raw("title") as string;
  const match = rawTitle.match(GRADIENT_RE);
  const before = match ? splitWords(match[1]) : splitWords(rawTitle);
  const gradient = match ? match[2] : null;
  const after = match ? splitWords(match[3]) : [];

  const totalPlainWords = [...before, ...after].filter(
    (w) => !/^\s+$/.test(w),
  ).length;
  const wordStagger = 0.24;
  const gradientDelay = reduceMotion
    ? 0
    : 0.25 + totalPlainWords * wordStagger + 0.25;

  const container: Variants = {
    hidden: {},
    visible: {
      transition: {
        staggerChildren: reduceMotion ? 0 : wordStagger,
        delayChildren: reduceMotion ? 0 : 0.25,
      },
    },
  };

  const word: Variants = {
    hidden: {
      opacity: 0,
      y: reduceMotion ? 0 : 22,
      filter: reduceMotion ? "blur(0px)" : "blur(10px)",
    },
    visible: {
      opacity: 1,
      y: 0,
      filter: "blur(0px)",
      transition: { duration: 1.6, ease: [0.22, 1, 0.36, 1] },
    },
  };

  const gradientWord: Variants = {
    hidden: {
      opacity: 0,
      y: reduceMotion ? 0 : 28,
      scale: reduceMotion ? 1 : 1.35,
      rotate: reduceMotion ? 0 : -6,
      filter: reduceMotion ? "blur(0px)" : "blur(12px)",
    },
    visible: {
      opacity: 1,
      y: 0,
      scale: 1,
      rotate: 0,
      filter: "blur(0px)",
      transition: {
        delay: gradientDelay,
        type: "spring",
        stiffness: 110,
        damping: 14,
        mass: 1.1,
      },
    },
  };

  const subtitle: Variants = {
    hidden: {
      opacity: 0,
      y: reduceMotion ? 0 : 14,
      filter: reduceMotion ? "blur(0px)" : "blur(6px)",
    },
    visible: {
      opacity: 1,
      y: 0,
      filter: "blur(0px)",
      transition: {
        delay: reduceMotion ? 0 : gradientDelay + 0.45,
        duration: 1.2,
        ease: [0.22, 1, 0.36, 1],
      },
    },
  };

  const ctaLeft: Variants = {
    hidden: { opacity: 0, x: reduceMotion ? 0 : -32 },
    visible: {
      opacity: 1,
      x: 0,
      transition: {
        delay: reduceMotion ? 0 : gradientDelay + 0.85,
        type: "spring",
        stiffness: 95,
        damping: 18,
        mass: 1.2,
      },
    },
  };

  const ctaRight: Variants = {
    hidden: { opacity: 0, x: reduceMotion ? 0 : 32 },
    visible: {
      opacity: 1,
      x: 0,
      transition: {
        delay: reduceMotion ? 0 : gradientDelay + 1.0,
        type: "spring",
        stiffness: 95,
        damping: 18,
        mass: 1.2,
      },
    },
  };

  return (
    <section className={styles.heroFrame}>
      <HeroBubbles />
      <div className={styles.inner}>
        <motion.div
          className={styles.content}
          initial="hidden"
          animate="visible"
        >
          <motion.h1 className={styles.title} variants={container}>
            {before.map((chunk, i) =>
              /^\s+$/.test(chunk) ? (
                <span key={`b-${i}`}>{chunk}</span>
              ) : (
                <motion.span
                  key={`b-${i}`}
                  variants={word}
                  style={{ display: "inline-block", willChange: "transform" }}
                >
                  {chunk}
                </motion.span>
              ),
            )}
            {gradient && (
              <motion.span
                className={styles.gradientWord}
                variants={gradientWord}
                style={{ display: "inline-block", willChange: "transform" }}
              >
                {gradient}
              </motion.span>
            )}
            {after.map((chunk, i) =>
              /^\s+$/.test(chunk) ? (
                <span key={`a-${i}`}>{chunk}</span>
              ) : (
                <motion.span
                  key={`a-${i}`}
                  variants={word}
                  style={{ display: "inline-block", willChange: "transform" }}
                >
                  {chunk}
                </motion.span>
              ),
            )}
          </motion.h1>

          <motion.p className={styles.subtitle} variants={subtitle}>
            {t("subtitle")}
          </motion.p>

          <div className={styles.ctas}>
            <motion.div variants={ctaLeft}>
              <Button
                href="/explore"
                variant="primary"
                size="lg"
                className={styles.cta}
              >
                {t("ctaExplore")}
              </Button>
            </motion.div>
            <motion.div variants={ctaRight}>
              <Button
                href="/create-course"
                variant="primary"
                size="lg"
                className={`${styles.cta} ${styles.ctaSoft}`}
              >
                {t("ctaPublish")}
              </Button>
            </motion.div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

export default Hero;
