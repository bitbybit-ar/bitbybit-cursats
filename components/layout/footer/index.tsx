import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { LogoBlocks } from "@/components/common/logo-blocks";
import { Wordmark } from "@/components/common/wordmark";
import { GithubIcon } from "@/components/icons";
import styles from "./footer.module.scss";

export function Footer() {
  const t = useTranslations("landing.footer");

  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <div className={styles.brand}>
          <LogoBlocks />
          <Wordmark />
        </div>

        <nav className={styles.links} aria-label={t("ariaLabel")}>
          <a
            href="https://habits.bitbybit.com.ar"
            target="_blank"
            rel="noopener noreferrer"
            className={styles.link}
          >
            {t("habitsLink")}
          </a>
          <a
            href="https://arena.bitbybit.com.ar"
            target="_blank"
            rel="noopener noreferrer"
            className={styles.link}
          >
            {t("arenaLink")}
          </a>
          <Link href="/faq" className={styles.link}>
            {t("faqLink")}
          </Link>
          <a
            href="https://github.com/bitbybit-ar/bitbybit-cursats"
            target="_blank"
            rel="noopener noreferrer"
            className={styles.link}
            aria-label={t("githubAriaLabel")}
          >
            <GithubIcon size={16} />
            {t("github")}
          </a>
        </nav>
      </div>
    </footer>
  );
}

export default Footer;
