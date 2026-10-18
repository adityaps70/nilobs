// The site is light-only by design; components that ask for the theme always get light.
export function useTheme() {
  return { theme: "light" as const, systemTheme: "light" as const }
}
