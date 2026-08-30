import { ThemeProvider as NextThemeProvider, useTheme } from "next-themes";

import { useNativeTheme } from "../hooks/use-native-theme";

/**
 * Shared across both window entries (the main window and the tray popover are
 * separate HTML documents, so each root needs its own provider). They share a
 * localStorage origin and therefore the same key, keeping the two in sync.
 */
const STORAGE_KEY = "skillone-theme";

/**
 * shadcn/ui already ships the dark palette: `src/index.css` defines both a
 * `:root` and a `.dark` set of oklch variables plus the
 * `@custom-variant dark (&:is(.dark *))` rule, so theming is purely a matter of
 * toggling the `dark` class on `<html>` — which is what next-themes does here.
 *
 * `enableColorScheme` also sets `color-scheme` on `<html>`, turning native
 * scrollbars, selects and spellcheck highlights dark for free.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      enableColorScheme
      storageKey={STORAGE_KEY}
      disableTransitionOnChange
    >
      <NativeThemeSync />
      {children}
    </NextThemeProvider>
  );
}

/** Bridges next-themes state to the native window; renders nothing. */
function NativeThemeSync() {
  const { theme } = useTheme();
  useNativeTheme(theme);
  return null;
}
