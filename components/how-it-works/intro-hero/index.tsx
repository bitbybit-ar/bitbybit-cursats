"use client";

import { motion, useReducedMotion, type Variants } from "framer-motion";
import { useTranslations } from "next-intl";
import styles from "./intro-hero.module.scss";

type Token = { type: "gradient" | "text"; value: string };

function parseTitle(raw: string): Token[] {
  const tokens: Token[] = [];
  const re = /<gradient>(.*?)<\/gradient>/g;
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
    if (m.index > lastIndex) {
      tokens.push({ type: "text", value: raw.slice(lastIndex, m.index) });
    }
    tokens.push({ type: "gradient", value: m[1] });
    lastIndex = m.index + m[0].length;
  }
  if (lastIndex < raw.length) {
    tokens.push({ type: "text", value: raw.slice(lastIndex) });
  }
  return tokens;
}

// The gradient words ("SATS", "PESOS") pop in first; the surrounding
// text fades in afterwards. Delays are derived per token from these
// bases so the order holds regardless of how many gradient words the
// copy uses.
const GRADIENT_BASE = 0.1;
const GRADIENT_STAGGER = 0.18;
const TEXT_BASE = 0.6;
const TEXT_STAGGER = 0.16;

export function IntroHero() {
  const t = useTranslations("howItWorks");
  const reduceMotion = useReducedMotion();

  const tokens = parseTitle(t.raw("hero.title") as string);
  const gradientCount = tokens.filter((tok) => tok.type === "gradient").length;
  const subtitleDelay =
    TEXT_BASE +
    (tokens.length - gradientCount) * TEXT_STAGGER +
    0.15;

  const pop: Variants = {
    hidden: {
      opacity: 0,
      scale: reduceMotion ? 1 : 0.8,
      y: reduceMotion ? 0 : 8,
    },
    visible: (delay: number) => ({
      opacity: 1,
      scale: 1,
      y: 0,
      transition: reduceMotion
        ? { duration: 0.3 }
        : { delay, type: "spring", stiffness: 200, damping: 14, mass: 0.9 },
    }),
  };

  const fade: Variants = {
    hidden: {
      opacity: 0,
      filter: reduceMotion ? "blur(0px)" : "blur(10px)",
    },
    visible: (delay: number) => ({
      opacity: 1,
      filter: "blur(0px)",
      transition: {
        delay: reduceMotion ? 0 : delay,
        duration: 0.9,
        ease: [0.22, 1, 0.36, 1],
      },
    }),
  };

  let gradientIndex = 0;
  let textIndex = 0;

  return (
    <section className={styles.heroSection}>
      <div className={styles.heroInner}>
        <motion.header
          className={styles.hero}
          initial="hidden"
          animate="visible"
        >
          <h1 className={styles.heroTitle}>
            {tokens.map((tok, i) => {
              if (tok.type === "gradient") {
                const delay = GRADIENT_BASE + gradientIndex * GRADIENT_STAGGER;
                gradientIndex += 1;
                return (
                  <motion.span
                    key={i}
                    className={styles.gradientWord}
                    variants={pop}
                    custom={delay}
                    style={{ display: "inline-block" }}
                  >
                    {tok.value}
                  </motion.span>
                );
              }
              const delay = TEXT_BASE + textIndex * TEXT_STAGGER;
              textIndex += 1;
              return (
                <motion.span
                  key={i}
                  variants={fade}
                  custom={delay}
                  style={{ display: "inline" }}
                >
                  {tok.value}
                </motion.span>
              );
            })}
          </h1>
          <motion.p
            className={styles.heroSubtitle}
            variants={fade}
            custom={subtitleDelay}
          >
            {t("hero.subtitle")}
          </motion.p>
        </motion.header>
      </div>
    </section>
  );
}

export default IntroHero;
