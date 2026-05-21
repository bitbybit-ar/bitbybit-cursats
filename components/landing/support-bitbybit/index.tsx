"use client";

import { useState } from "react";
import { motion, useReducedMotion, type Variants } from "framer-motion";
import { useTranslations } from "next-intl";
import { Section } from "@/components/ui/section";
import { Block } from "@/components/common/block";
import { BoltIcon, GithubIcon } from "@/components/icons";
import { ZapModal } from "@/components/landing/zap-modal";
import styles from "./support-bitbybit.module.scss";

const PROJECT_REPOS = [
  {
    key: "cursatsRepo",
    url: "https://github.com/bitbybit-ar/bitbybit-cursats",
  },
  { key: "arenaRepo", url: "https://github.com/bitbybit-ar/bitbybit-arena" },
  { key: "habitsRepo", url: "https://github.com/bitbybit-ar/bitbybit-habits" },
] as const;

export function SupportBitByBit() {
  const t = useTranslations("landing.support");
  const [showZapModal, setShowZapModal] = useState(false);
  const reduceMotion = useReducedMotion();

  const container: Variants = {
    hidden: {},
    visible: {
      transition: {
        staggerChildren: reduceMotion ? 0 : 0.15,
        delayChildren: reduceMotion ? 0 : 0.05,
      },
    },
  };

  const fade: Variants = {
    hidden: {
      opacity: 0,
      filter: reduceMotion ? "blur(0px)" : "blur(12px)",
    },
    visible: {
      opacity: 1,
      filter: "blur(0px)",
      transition: { duration: 1.1, ease: [0.22, 1, 0.36, 1] },
    },
  };

  const rise: Variants = {
    hidden: {
      opacity: 0,
      y: reduceMotion ? 0 : 18,
    },
    visible: {
      opacity: 1,
      y: 0,
      transition: { type: "spring", stiffness: 110, damping: 18, mass: 1.0 },
    },
  };

  return (
    <Section id="support" className={styles.section}>
      <Block size="large" color="lime" className={styles.floatBlock1}>
        <BoltIcon size={32} color="white" />
      </Block>
      <Block size="large" color="blue" className={styles.floatBlock2}>
        <GithubIcon size={32} color="white" />
      </Block>

      <motion.div
        className={styles.content}
        variants={container}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-25% 0px" }}
      >
        <motion.h2 className={styles.title} variants={fade}>
          {t("title")}
        </motion.h2>
        <motion.p className={styles.subtitle} variants={fade}>
          {t("subtitle")}
        </motion.p>

        <motion.div className={styles.primaryActions} variants={rise}>
          <button
            type="button"
            className={styles.zapButton}
            onClick={() => setShowZapModal(true)}
            aria-label={t("zapAriaLabel")}
          >
            <BoltIcon size={18} color="white" />
            {t("zapDevs")}
          </button>
          <a
            href="https://github.com/bitbybit-ar"
            target="_blank"
            rel="noopener noreferrer"
            className={styles.githubButton}
          >
            <GithubIcon size={18} />
            {t("starOnGithub")}
          </a>
        </motion.div>

        <motion.p className={styles.contributeLabel} variants={rise}>
          {t("orContribute")}
        </motion.p>
        <motion.div className={styles.projectRepos} variants={rise}>
          {PROJECT_REPOS.map(({ key, url }) => (
            <a
              key={key}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.repoLink}
            >
              <GithubIcon size={16} />
              {t(key)}
            </a>
          ))}
        </motion.div>
      </motion.div>

      {showZapModal && <ZapModal onClose={() => setShowZapModal(false)} />}
    </Section>
  );
}

export default SupportBitByBit;
