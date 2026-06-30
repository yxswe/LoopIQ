import { useCallback, useEffect, useState } from "react";
import {
  applyTheme,
  getPref,
  setPref,
  subscribeSystem,
  type ThemeMode,
} from "../lib/theme";

/**
 * React wrapper around the theme module. Tracks the user's preference, applies
 * it on change, and re-applies when the OS preference flips (only when the
 * current pref is "system").
 */
export const useTheme = () => {
  const [mode, setMode] = useState<ThemeMode>(() => getPref());

  // Apply on mount + whenever the user picks a different mode.
  useEffect(() => {
    applyTheme(mode);
  }, [mode]);

  // While "system" is selected, respond to OS theme changes.
  useEffect(() => {
    if (mode !== "system") return;
    return subscribeSystem(() => applyTheme("system"));
  }, [mode]);

  const update = useCallback((next: ThemeMode) => {
    setPref(next);
    setMode(next);
  }, []);

  return { mode, setMode: update };
};
