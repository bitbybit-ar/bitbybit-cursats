"use client";

import React from "react";
import {
  ThemeProvider as NextThemesProvider,
  useTheme as useNextTheme,
} from "next-themes";

interface ThemeProviderProps {
  children: React.ReactNode;
  /**
   * CSP nonce for the inline anti-FOUC script next-themes injects.
   * Without it, that script is refused under the production
   * `script-src 'nonce-…' 'strict-dynamic'` policy. `undefined` in
   * development, where the policy still allows inline scripts.
   */
  nonce?: string;
}

export function ThemeProvider({ children, nonce }: ThemeProviderProps) {
  return (
    <NextThemesProvider
      attribute="data-theme"
      defaultTheme="light"
      enableSystem
      enableColorScheme={false}
      nonce={nonce}
    >
      {children}
    </NextThemesProvider>
  );
}

export type ThemePreference = "system" | "light" | "dark";

export function useTheme() {
  const { theme, setTheme, resolvedTheme } = useNextTheme();

  const toggleTheme = () => {
    setTheme(resolvedTheme === "dark" ? "light" : "dark");
  };

  const setThemePreference = (value: ThemePreference) => setTheme(value);

  return {
    theme: (resolvedTheme ?? "light") as "light" | "dark",
    preference: (theme ?? "system") as ThemePreference,
    toggleTheme,
    setThemePreference,
  };
}
