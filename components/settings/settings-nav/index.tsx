"use client";

import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { cn } from "@/lib/utils";
import {
  UserIcon,
  BoltIcon,
  BellIcon,
  SettingsIcon,
  CloseIcon,
} from "@/components/icons";
import type { SettingsSection } from "./sections";
import { SETTINGS_SECTIONS } from "./sections";
import styles from "./settings-nav.module.scss";

/**
 * Vertical sidebar that flips the active section via `?section=`.
 * The page server-side reads the same param and renders the
 * matching panel. Default section is `profile`.
 *
 * The icons are picked for vibes-not-precision: a person for
 * Profile, a bolt for payouts, a gear for preferences, a bell for
 * notifications, and a close-icon (×) for the danger zone.
 * Replace with dedicated glyphs later if we add them.
 */

const ICONS: Record<SettingsSection, React.ComponentType<{ size?: number }>> = {
  profile: UserIcon,
  payout: BoltIcon,
  preferences: SettingsIcon,
  notifications: BellIcon,
  danger: CloseIcon,
};

export function SettingsNav() {
  const t = useTranslations("settings.nav");
  const params = useSearchParams();
  const active = (params.get("section") as SettingsSection | null) ?? "profile";

  return (
    <nav className={styles.nav} aria-label={t("ariaLabel")}>
      <ul className={styles.list}>
        {SETTINGS_SECTIONS.map((section) => {
          const Icon = ICONS[section];
          const isActive = active === section;
          return (
            <li key={section}>
              <Link
                href={`/settings?section=${section}`}
                className={cn(styles.item, isActive && styles.active)}
                aria-current={isActive ? "page" : undefined}
                replace
                scroll={false}
              >
                <Icon size={16} />
                <span>{t(section)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export default SettingsNav;
