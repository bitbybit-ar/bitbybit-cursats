"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Link, useRouter, usePathname } from "@/i18n/routing";
import { Avatar } from "@/components/common/avatar";
import { Button } from "@/components/ui/button";
import {
  ArrowLeftIcon,
  BellIcon,
  BookIcon,
  CloseIcon,
  LogoutIcon,
  SettingsIcon,
  ShoppingBagIcon,
} from "@/components/icons";
import { LocaleThemeToggle } from "@/components/layout/locale-theme-toggle";
import { NotificationList } from "@/components/layout/notification-bell/notification-list";
import { useSignerContext } from "@/lib/contexts/signer-context";
import { useClickOutside } from "@/lib/hooks/useClickOutside";
import { useNostrProfile } from "@/lib/hooks/useNostrProfile";
import { useNotificationsContext } from "@/lib/contexts/notifications-context";
import { cn } from "@/lib/utils";
import styles from "./mobile-menu.module.scss";

interface MobileMenuProps {
  open: boolean;
  onClose: () => void;
}

// Mirror of the same list in Navbar — keep them in sync. `anchor`
// jumps to a section on the landing page; `link` is a locale-aware
// route that works from anywhere.
const SECTIONS = [
  { id: "explore", kind: "link", target: "/explore" },
  { id: "howItWorks", kind: "link", target: "/how-it-works" },
  { id: "features", kind: "link", target: "/features" },
] as const;

export function MobileMenu({ open, onClose }: MobileMenuProps) {
  const t = useTranslations("landing.nav");
  const tNotif = useTranslations("notifications");
  const { session, signOut } = useSignerContext();
  const router = useRouter();
  const pathname = usePathname();
  const isSignInPage = pathname === "/sign-in";
  const { profile } = useNostrProfile(session?.pubkey);
  const { notifications, unreadCount, markAsRead, markAllRead } =
    useNotificationsContext();
  // The drawer is either showing the menu or the notifications panel
  // (reached from the bell, dismissed with the back arrow).
  const [view, setView] = useState<"menu" | "notifications">("menu");
  const drawerRef = useRef<HTMLElement>(null);

  useClickOutside(drawerRef, onClose, open);

  // Lock body scroll while the drawer is open and close on Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  // Always reopen on the menu, never stranded in the notifications panel.
  useEffect(() => {
    if (!open) setView("menu");
  }, [open]);

  const handleSignOut = async () => {
    onClose();
    await signOut();
    router.push("/");
  };

  const profileName = profile?.display_name ?? profile?.name ?? null;

  return (
    <>
      <div
        className={cn(styles.backdrop, open && styles.backdropOpen)}
        aria-hidden="true"
      />
      <aside
        ref={drawerRef}
        className={cn(styles.drawer, open && styles.drawerOpen)}
        aria-label={t("accountMenu")}
        aria-hidden={!open}
        aria-modal={open ? "true" : undefined}
        role="dialog"
      >
        {view === "notifications" ? (
          <>
            {/* Notifications panel: a lone back arrow returns to the
                menu (per spec — no title, no close here). */}
            <header className={styles.header}>
              <button
                type="button"
                className={styles.backButton}
                onClick={() => setView("menu")}
                aria-label={tNotif("back")}
              >
                <ArrowLeftIcon size={20} />
              </button>
            </header>
            <div className={styles.notificationsPanel}>
              <NotificationList
                notifications={notifications}
                unreadCount={unreadCount}
                onMarkAsRead={markAsRead}
                onMarkAllRead={markAllRead}
                onActivate={onClose}
              />
            </div>
          </>
        ) : (
          <>
        <header className={styles.header}>
          {session ? (
            <div className={styles.userBadge}>
              <Avatar
                src={profile?.picture}
                name={profileName}
                alt=""
                size="sm"
              />
              <span className={styles.userName}>
                {profileName ?? t("accountMenu")}
              </span>
              <button
                type="button"
                className={styles.bellButton}
                onClick={() => setView("notifications")}
                aria-label={tNotif("ariaLabel")}
              >
                <BellIcon size={18} />
                {unreadCount > 0 && (
                  <span className={styles.bellBadge} aria-hidden="true">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
              </button>
            </div>
          ) : null}
          <button
            type="button"
            className={styles.closeButton}
            onClick={onClose}
            aria-label={t("closeMenu")}
          >
            <CloseIcon size={20} />
          </button>
        </header>

        <nav className={styles.nav} aria-label={t("accountMenu")}>
          {SECTIONS.map((section) =>
            section.kind === "link" ? (
              <Link
                key={section.id}
                href={section.target}
                className={styles.link}
                onClick={onClose}
              >
                {t(section.id)}
              </Link>
            ) : (
              <a
                key={section.id}
                href={section.target}
                className={styles.link}
                onClick={onClose}
              >
                {t(section.id)}
              </a>
            )
          )}
        </nav>

        <div className={styles.divider} role="presentation" />

        <div className={styles.actions}>
          {session ? (
            <>
              <Link
                href="/purchases"
                className={styles.action}
                onClick={onClose}
              >
                <ShoppingBagIcon size={16} />
                {t("myPurchases")}
              </Link>
              <Link
                href="/my-courses"
                className={styles.action}
                onClick={onClose}
              >
                <BookIcon size={16} />
                {t("myCourses")}
              </Link>
              <Link
                href="/settings"
                className={styles.action}
                onClick={onClose}
              >
                <SettingsIcon size={16} />
                {t("settings")}
              </Link>
              <button
                type="button"
                className={cn(styles.action, styles.actionDanger)}
                onClick={handleSignOut}
              >
                <LogoutIcon size={16} />
                {t("signOut")}
              </button>
            </>
          ) : isSignInPage ? null : (
            <Button
              href="/sign-in"
              variant="primary"
              fullWidth
              onClick={onClose}
            >
              {t("signIn")}
            </Button>
          )}
        </div>

        {/* Theme + locale toggles live at the foot of the drawer on
            mobile (they're hidden in the navbar on small viewports
            to keep the right-cluster compact). `margin-block-start:
            auto` pins this row to the bottom of the column. */}
        <div className={styles.preferences}>
          <LocaleThemeToggle />
        </div>
          </>
        )}
      </aside>
    </>
  );
}

export default MobileMenu;
