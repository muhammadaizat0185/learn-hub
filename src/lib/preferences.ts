export interface DisplayPreferences {
  theme: "system" | "light" | "dark";
  textSize: "standard" | "large" | "larger";
}

const STORAGE_KEY = "hub.v1.preferences";
const SYSTEM_THEME_QUERY = "(prefers-color-scheme: dark)";
export const DISPLAY_PREFERENCES_EVENT = "hub:display-preferences";

let notice: string | null = null;
let appliedPreferences: DisplayPreferences | null = null;

function normalize(value: unknown): DisplayPreferences {
  const record = typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  return {
    theme: record.theme === "light" || record.theme === "dark" ? record.theme : "system",
    textSize: record.textSize === "large" || record.textSize === "larger"
      ? record.textSize
      : "standard",
  };
}

function isValid(value: unknown): value is DisplayPreferences {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (record.theme === "system" || record.theme === "light" || record.theme === "dark")
    && (record.textSize === "standard" || record.textSize === "large" || record.textSize === "larger");
}

/** The most recent load/save warning, for an honest user-facing status. */
export function getDisplayPreferencesNotice(): string | null {
  return notice;
}

export function loadDisplayPreferences(): DisplayPreferences {
  notice = null;
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    notice = "This browser could not read your display preferences. Default settings are shown; changes may not be saved.";
    return normalize(null);
  }
  if (raw === null) return normalize(null);
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isValid(parsed)) {
      notice = "Some saved display preferences could not be read. Default settings are used for unrecognized choices.";
    }
    return normalize(parsed);
  } catch {
    notice = "Saved display preferences could not be read. Default settings are shown.";
    return normalize(null);
  }
}

/** Persists only; callers can apply a choice even when saving is unavailable. */
export function saveDisplayPreferences(preferences: DisplayPreferences): boolean {
  if (!isValid(preferences)) {
    notice = "Those display preferences are not supported. Choose one of the available settings.";
    return false;
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalize(preferences)));
    notice = null;
    return true;
  } catch {
    notice = "This browser could not save your display preferences. Changes apply for now, but may reset when you reopen this page or reload.";
    return false;
  }
}

function systemTheme(): MediaQueryList | null {
  try {
    return window.matchMedia(SYSTEM_THEME_QUERY);
  } catch {
    return null;
  }
}

function apply(preferences: DisplayPreferences, dark: boolean) {
  if (typeof document === "undefined") return;
  const safe = normalize(preferences);
  appliedPreferences = safe;
  document.documentElement.dataset.theme = safe.theme === "system"
    ? dark ? "dark" : "light"
    : safe.theme;
  document.documentElement.dataset.textSize = safe.textSize;
  window.dispatchEvent(new CustomEvent<DisplayPreferences>(DISPLAY_PREFERENCES_EVENT, {
    detail: { ...safe },
  }));
}

export function applyDisplayPreferences(preferences: DisplayPreferences): void {
  apply(preferences, systemTheme()?.matches ?? false);
}

export function initDisplayPreferences(): () => void {
  if (typeof window === "undefined" || typeof document === "undefined") return () => {};
  const media = systemTheme();
  apply(loadDisplayPreferences(), media?.matches ?? false);

  function onSystemChange(event: MediaQueryListEvent) {
    // Use the applied choice, not storage: a failed save must still work for now.
    if (appliedPreferences?.theme === "system") apply(appliedPreferences, event.matches);
  }

  function onStorage(event: StorageEvent) {
    if (event.key !== STORAGE_KEY && event.key !== null) return;
    try {
      if (event.storageArea && event.storageArea !== window.localStorage) return;
    } catch {
      // Loading below reports unavailable storage and safely applies defaults.
    }
    applyDisplayPreferences(loadDisplayPreferences());
  }

  // Older Safari versions expose addListener rather than addEventListener.
  if (media?.addEventListener) media.addEventListener("change", onSystemChange);
  else media?.addListener?.(onSystemChange);
  window.addEventListener("storage", onStorage);

  return () => {
    if (media?.removeEventListener) media.removeEventListener("change", onSystemChange);
    else media?.removeListener?.(onSystemChange);
    window.removeEventListener("storage", onStorage);
  };
}
