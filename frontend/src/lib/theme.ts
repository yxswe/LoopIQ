/**
 * Theme management — light / dark / system.
 *
 * Pattern lifted from aurowork/apps/app/src/app/theme.ts. We store the user's
 * preference in localStorage and resolve "system" via matchMedia at read time.
 * Applying a theme sets `data-theme` on <html> and updates `color-scheme`,
 * which lets every CSS rule (and Tailwind via @theme inline) reflect the
 * change without re-mounting React.
 */

export type ThemeMode = "light" | "dark" | "system";

const THEME_PREF_KEY = "loopiq.themePref";
const MEDIA_QUERY = "(prefers-color-scheme: dark)";

const getMediaQueryList = () =>
  typeof window === "undefined" ? null : window.matchMedia(MEDIA_QUERY);

export const getPref = (): ThemeMode => {
  if (typeof window === "undefined") return "system";
  try {
    const stored = window.localStorage.getItem(THEME_PREF_KEY);
    if (stored === "light" || stored === "dark" || stored === "system") {
      return stored;
    }
  } catch {
    // ignore localStorage failures (private mode, etc.)
  }
  return "system";
};

export const setPref = (mode: ThemeMode) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(THEME_PREF_KEY, mode);
  } catch {
    // ignore
  }
};

const resolveMode = (mode: ThemeMode): "light" | "dark" => {
  if (mode !== "system") return mode;
  return getMediaQueryList()?.matches ? "dark" : "light";
};

export const applyTheme = (mode: ThemeMode) => {
  if (typeof document === "undefined") return;
  const resolved = resolveMode(mode);
  document.documentElement.dataset.theme = resolved;
  document.documentElement.style.colorScheme = resolved;
};

export const subscribeSystem = (onChange: (isDark: boolean) => void) => {
  const list = getMediaQueryList();
  if (!list) return () => undefined;
  const handler = (event: MediaQueryListEvent) => onChange(event.matches);
  list.addEventListener("change", handler);
  return () => list.removeEventListener("change", handler);
};
