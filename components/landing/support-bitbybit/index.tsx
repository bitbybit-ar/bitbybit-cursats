"use client";

import { useState } from "react";
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

  return (
    <Section id="support" className={styles.section}>
      <Block size="large" color="lime" className={styles.floatBlock1}>
        <BoltIcon size={32} color="white" />
      </Block>
      <Block size="large" color="blue" className={styles.floatBlock2}>
        <GithubIcon size={32} color="white" />
      </Block>

      <div className={styles.content}>
        <h2 className={styles.title}>{t("title")}</h2>
        <p className={styles.subtitle}>{t("subtitle")}</p>

        <div className={styles.primaryActions}>
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
        </div>

        <p className={styles.contributeLabel}>{t("orContribute")}</p>
        <div className={styles.projectRepos}>
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
        </div>
      </div>

      {showZapModal && <ZapModal onClose={() => setShowZapModal(false)} />}
    </Section>
  );
}

export default SupportBitByBit;
