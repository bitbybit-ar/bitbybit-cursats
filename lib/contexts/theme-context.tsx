"use client";

import React from "react";
import {
  ThemeProvider as NextThemesProvider,
  useTheme as useNextTheme,
} from "next-themes";

interface ThemeProviderProps {
  children: React.ReactNode;
}

export function ThemeProvider({ children }: ThemeProviderProps) {
  return (
    <NextThemesProvider
      attribute="data-theme"
      defaultTheme="light"
      enableSystem
      enableColorScheme={false}
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
