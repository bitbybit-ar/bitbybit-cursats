/**
 * Single source of truth for the settings sidebar order + ids.
 * The settings page (server) reads this list to validate the
 * `?section=` param; the nav (client) iterates it to render the
 * sidebar. Keep entries in display order.
 */
export const SETTINGS_SECTIONS = [
  "profile",
  "payout",
  "preferences",
  "danger",
] as const;

export type SettingsSection = (typeof SETTINGS_SECTIONS)[number];

export function isSettingsSection(value: string): value is SettingsSection {
  return (SETTINGS_SECTIONS as readonly string[]).includes(value);
}
