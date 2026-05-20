"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { Link, useRouter, usePathname } from "@/i18n/routing";
import { LogoBlocks } from "@/components/common/logo-blocks";
import { Wordmark } from "@/components/common/wordmark";
import { Avatar } from "@/components/common/avatar";
import { LocaleThemeToggle } from "@/components/layout/locale-theme-toggle";
import { MobileMenu } from "@/components/layout/mobile-menu";
import { NotificationBell } from "@/components/layout/notification-bell";
import { Button } from "@/components/ui/button";
import {
  BookIcon,
  CloseIcon,
  LogoutIcon,
  MenuIcon,
  SettingsIcon,
  ShoppingBagIcon,
  UserIcon,
} from "@/components/icons";
import { useSignerContext } from "@/lib/contexts/signer-context";
import { useClickOutside } from "@/lib/hooks/useClickOutside";
import { useNostrProfile } from "@/lib/hooks/useNostrProfile";
import { cn } from "@/lib/utils";
import styles from "./navbar.module.scss";

// Navbar entries are a hybrid: `anchor` jumps to a section that lives
// on the landing page (only works while viewing `/`); `link` is a
// locale-aware route that works from anywhere. Keep this list in sync
// with the matching one in MobileMenu.
const SECTIONS = [
  { id: "explore", kind: "link", target: "/explore" },
  { id: "howItWorks", kind: "link", target: "/how-it-works" },
  { id: "features", kind: "link", target: "/features" },
] as const;
const SCROLLED_THRESHOLD = 16;

export function Navbar() {
  const t = useTranslations("landing.nav");
  const { session, signOut } = useSignerContext();
  const router = useRouter();
  const pathname = usePathname();
  const isSignInPage = pathname === "/sign-in";
  const { profile } = useNostrProfile(session?.pubkey);
  const [scrolled, setScrolled] = useState(false);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const accountMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      setScrolled(y > SCROLLED_THRESHOLD);
      const docHeight =
        document.documentElement.scrollHeight - window.innerHeight;
      setScrollProgress(docHeight > 0 ? (y / docHeight) * 100 : 0);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const closeAccountMenu = useCallback(() => setAccountMenuOpen(false), []);
  const closeMobileMenu = useCallback(() => setMobileMenuOpen(false), []);
  useClickOutside(accountMenuRef, closeAccountMenu, accountMenuOpen);

  const handleSignOut = async () => {
    setAccountMenuOpen(false);
    await signOut();
    router.push("/");
  };

  const profileName = profile?.display_name ?? profile?.name ?? null;
  const avatarLabel = profileName ?? t("accountMenu");

  return (
    <>
      <nav className={cn(styles.navbar, scrolled && styles.scrolled)}>
        <div className={styles.inner}>
          <Link href="/" className={styles.logo} aria-label="Cursats">
            <LogoBlocks />
            <Wordmark />
          </Link>

          <div className={styles.links}>
            {SECTIONS.map((section) =>
              section.kind === "link" ? (
                <Link
                  key={section.id}
                  href={section.target}
                  className={styles.link}
                >
                  {t(section.id)}
                </Link>
              ) : (
                <a
                  key={section.id}
                  href={section.target}
                  className={styles.link}
                >
                  {t(section.id)}
                </a>
              )
            )}
          </div>

          <div className={styles.right}>
            {/* Hidden on mobile — the toggle is duplicated inside the
                burger menu so the navbar right-cluster stays compact
                on small viewports. */}
            <LocaleThemeToggle className={styles.desktopOnly} />

            {session ? (
              <>
                <NotificationBell className={styles.desktopOnly} />
                <div
                  className={cn(styles.avatarWrapper, styles.desktopOnly)}
                  ref={accountMenuRef}
                >
                  <button
                    type="button"
                    className={styles.avatarButton}
                    onClick={() => setAccountMenuOpen((prev) => !prev)}
                    aria-expanded={accountMenuOpen}
                    aria-haspopup="true"
                    aria-label={avatarLabel}
                  >
                    <Avatar
                      src={profile?.picture}
                      name={profileName}
                      alt=""
                      size="sm"
                    />
                  </button>
                  {accountMenuOpen ? (
                    <div className={styles.avatarMenu} role="menu">
                      <Link
                        href="/purchases"
                        className={styles.menuItem}
                        onClick={closeAccountMenu}
                      >
                        <ShoppingBagIcon size={16} />
                        {t("myPurchases")}
                      </Link>
                      <Link
                        href="/my-courses"
                        className={styles.menuItem}
                        onClick={closeAccountMenu}
                      >
                        <BookIcon size={16} />
                        {t("myCourses")}
                      </Link>
                      <Link
                        href="/settings"
                        className={styles.menuItem}
                        onClick={closeAccountMenu}
                      >
                        <SettingsIcon size={16} />
                        {t("settings")}
                      </Link>
                      <button
                        type="button"
                        className={cn(styles.menuItem, styles.menuItemDanger)}
                        onClick={handleSignOut}
                      >
                        <LogoutIcon size={16} />
                        {t("signOut")}
                      </button>
                    </div>
                  ) : null}
                </div>
              </>
            ) : isSignInPage ? null : (
              <>
                {/* Mobile-only icon CTA — same destination as the
                    desktop button below, but compressed to an icon
                    so it sits comfortably next to the burger. */}
                <Link
                  href="/sign-in"
                  className={styles.iconCta}
                  aria-label={t("signIn")}
                >
                  <UserIcon size={18} />
                </Link>
                <Button
                  href="/sign-in"
                  variant="primary"
                  size="sm"
                  className={styles.desktopOnly}
                >
                  {t("signIn")}
                </Button>
              </>
            )}

            {/* Burger — mobile only. Toggles the slide-in MobileMenu. */}
            <button
              type="button"
              className={styles.burger}
              onClick={() => setMobileMenuOpen((prev) => !prev)}
              aria-expanded={mobileMenuOpen}
              aria-controls="mobile-menu"
              aria-label={mobileMenuOpen ? t("closeMenu") : t("openMenu")}
            >
              {mobileMenuOpen ? (
                <CloseIcon size={22} />
              ) : (
                <MenuIcon size={22} />
              )}
            </button>
          </div>
        </div>

        <div
          className={styles.scrollProgress}
          style={{ width: `${scrollProgress}%` }}
          aria-hidden="true"
        />
      </nav>

      <MobileMenu open={mobileMenuOpen} onClose={closeMobileMenu} />
    </>
  );
}

export default Navbar;
