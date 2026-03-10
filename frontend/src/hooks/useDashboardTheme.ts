"use client";

export type DashboardTheme = "light" | "dark";

export function useDashboardTheme() {
  return {
    theme: "light" as DashboardTheme,
    isDark: false,
    ready: true,
    toggleTheme: () => {
      // Dark mode is intentionally disabled for now.
    },
    setTheme: (nextTheme: DashboardTheme) => {
      void nextTheme;
      // Dark mode is intentionally disabled for now.
    },
  };
}
