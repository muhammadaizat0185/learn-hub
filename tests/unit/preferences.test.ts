import { act, createElement } from "react";
import type { ReactElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CoursePicker from "../../src/components/CoursePicker";
import DisplaySettings from "../../src/components/DisplaySettings";
import {
  applyDisplayPreferences,
  getDisplayPreferencesNotice,
  initDisplayPreferences,
  loadDisplayPreferences,
  saveDisplayPreferences,
} from "../../src/lib/preferences";
import type { DisplayPreferences } from "../../src/lib/preferences";
import type { CourseMeta } from "../../src/types";

const KEY = "hub.v1.preferences";
const DEFAULTS: DisplayPreferences = { theme: "system", textSize: "standard" };
const cleanups: (() => void)[] = [];

function mockSystemTheme(dark = false, legacy = false) {
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  const add = vi.fn((listener: (event: MediaQueryListEvent) => void) => listeners.add(listener));
  const remove = vi.fn((listener: (event: MediaQueryListEvent) => void) => listeners.delete(listener));
  const media = {
    matches: dark,
    media: "(prefers-color-scheme: dark)",
    addListener: add,
    removeListener: remove,
    ...(legacy ? {} : {
      addEventListener: vi.fn((_type: string, listener: (event: MediaQueryListEvent) => void) => add(listener)),
      removeEventListener: vi.fn((_type: string, listener: (event: MediaQueryListEvent) => void) => remove(listener)),
    }),
  };
  vi.stubGlobal("matchMedia", vi.fn(() => media));
  return {
    media,
    listeners,
    setDark(matches: boolean) {
      media.matches = matches;
      for (const listener of listeners) listener({ matches } as MediaQueryListEvent);
    },
  };
}

function rootAttributes() {
  return {
    theme: document.documentElement.dataset.theme,
    textSize: document.documentElement.dataset.textSize,
  };
}

function storageChange(value: string | null, key: string | null = KEY) {
  if (key === null) localStorage.clear();
  else if (value === null) localStorage.removeItem(key);
  else localStorage.setItem(key, value);
  window.dispatchEvent(new StorageEvent("storage", { key, newValue: value, storageArea: localStorage }));
}

function render(element: ReactElement) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  act(() => root.render(element));
  cleanups.push(() => {
    act(() => root.unmount());
    container.remove();
  });
  return container;
}

function change(select: HTMLSelectElement, value: string) {
  act(() => {
    select.value = value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.removeAttribute("data-text-size");
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mockSystemTheme();
});

afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("display preference persistence and validation", () => {
  it("uses system/standard defaults without writing storage", () => {
    expect(loadDisplayPreferences()).toEqual(DEFAULTS);
    expect(getDisplayPreferencesNotice()).toBeNull();
    expect(localStorage.length).toBe(0);
  });

  it.each(["{", "", "null", "[]", "42", '"dark"', "{}"])(
    "handles malformed or incomplete saved data: %s", (raw) => {
      localStorage.setItem(KEY, raw);
      expect(loadDisplayPreferences()).toEqual(DEFAULTS);
      expect(getDisplayPreferencesNotice()).toMatch(/could not be read/);
      expect(localStorage.getItem(KEY)).toBe(raw);
    }
  );

  it.each(["system", "light", "dark"] as const)("round-trips the %s theme and each text size", (theme) => {
    for (const textSize of ["standard", "large", "larger"] as const) {
      const preferences = { theme, textSize };
      expect(saveDisplayPreferences(preferences)).toBe(true);
      expect(loadDisplayPreferences()).toEqual(preferences);
      expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual(preferences);
    }
    expect(getDisplayPreferencesNotice()).toBeNull();
  });

  it("repairs invalid theme and text size independently", () => {
    localStorage.setItem(KEY, JSON.stringify({ theme: "sepia", textSize: "large" }));
    expect(loadDisplayPreferences()).toEqual({ theme: "system", textSize: "large" });
    expect(getDisplayPreferencesNotice()).toBeTruthy();
    localStorage.setItem(KEY, JSON.stringify({ theme: "dark", textSize: 20 }));
    expect(loadDisplayPreferences()).toEqual({ theme: "dark", textSize: "standard" });
    expect(getDisplayPreferencesNotice()).toBeTruthy();
  });

  it.each([
    { theme: "LIGHT", textSize: "standard" },
    { theme: "system", textSize: "huge" },
    { theme: "system" },
    null,
    [],
  ])("rejects unsupported values on save: %j", (preferences) => {
    expect(saveDisplayPreferences(preferences as unknown as DisplayPreferences)).toBe(false);
    expect(getDisplayPreferencesNotice()).toMatch(/not supported/);
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it("ignores extra fields and does not write them back", () => {
    const preferences = { theme: "dark", textSize: "large", extra: "ignored" } as const;
    localStorage.setItem(KEY, JSON.stringify(preferences));
    expect(loadDisplayPreferences()).toEqual({ theme: "dark", textSize: "large" });
    expect(getDisplayPreferencesNotice()).toBeNull();
    expect(saveDisplayPreferences(preferences)).toBe(true);
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual({ theme: "dark", textSize: "large" });
  });

  it("handles denied storage reads and property access without throwing", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("denied"); });
    expect(loadDisplayPreferences()).toEqual(DEFAULTS);
    expect(getDisplayPreferencesNotice()).toMatch(/could not read/);
    vi.spyOn(window, "localStorage", "get").mockImplementation(() => { throw new Error("denied"); });
    expect(loadDisplayPreferences()).toEqual(DEFAULTS);
    expect(saveDisplayPreferences(DEFAULTS)).toBe(false);
    expect(getDisplayPreferencesNotice()).toMatch(/could not save/);
  });

  it("reports quota failures and clears the warning after a successful retry", () => {
    const write = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Full", "QuotaExceededError");
    });
    expect(saveDisplayPreferences(DEFAULTS)).toBe(false);
    expect(getDisplayPreferencesNotice()).toMatch(/could not save/);
    write.mockRestore();
    expect(saveDisplayPreferences(DEFAULTS)).toBe(true);
    expect(getDisplayPreferencesNotice()).toBeNull();
  });
});

describe("root attributes and preference lifecycle", () => {
  it.each([false, true])("resolves the initial system theme (dark=%s)", (dark) => {
    mockSystemTheme(dark);
    cleanups.push(initDisplayPreferences());
    expect(rootAttributes()).toEqual({ theme: dark ? "dark" : "light", textSize: "standard" });
  });

  it.each(["light", "dark"] as const)("keeps explicit %s mode across system changes", (theme) => {
    const system = mockSystemTheme();
    saveDisplayPreferences({ theme, textSize: "larger" });
    cleanups.push(initDisplayPreferences());
    system.setDark(true);
    expect(rootAttributes()).toEqual({ theme, textSize: "larger" });
    system.setDark(false);
    expect(rootAttributes().theme).toBe(theme);
  });

  it.each(["standard", "large", "larger"] as const)("applies %s text size without writing storage", (textSize) => {
    applyDisplayPreferences({ theme: "dark", textSize });
    expect(rootAttributes()).toEqual({ theme: "dark", textSize });
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it("normalizes invalid values before putting them on the root", () => {
    applyDisplayPreferences({ theme: "bad", textSize: "bad" } as unknown as DisplayPreferences);
    expect(rootAttributes()).toEqual({ theme: "light", textSize: "standard" });
  });

  it("continues applying system changes after a save fails", () => {
    const system = mockSystemTheme();
    saveDisplayPreferences({ theme: "dark", textSize: "standard" });
    cleanups.push(initDisplayPreferences());
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("full"); });
    const preferences: DisplayPreferences = { theme: "system", textSize: "large" };
    expect(saveDisplayPreferences(preferences)).toBe(false);
    applyDisplayPreferences(preferences);
    expect(rootAttributes()).toEqual({ theme: "light", textSize: "large" });
    system.setDark(true);
    expect(rootAttributes()).toEqual({ theme: "dark", textSize: "large" });
    expect(getDisplayPreferencesNotice()).toMatch(/could not save/);
  });

  it("syncs local storage edits, deletions, clearing, and invalid values", () => {
    cleanups.push(initDisplayPreferences());
    storageChange(JSON.stringify({ theme: "dark", textSize: "larger" }));
    expect(rootAttributes()).toEqual({ theme: "dark", textSize: "larger" });
    storageChange(null);
    expect(rootAttributes()).toEqual({ theme: "light", textSize: "standard" });
    storageChange(JSON.stringify({ theme: "dark", textSize: "large" }));
    storageChange(null, null);
    expect(rootAttributes()).toEqual({ theme: "light", textSize: "standard" });
    storageChange("{");
    expect(rootAttributes()).toEqual({ theme: "light", textSize: "standard" });
    expect(getDisplayPreferencesNotice()).toBeTruthy();
  });

  it("ignores unrelated keys and session storage events", () => {
    cleanups.push(initDisplayPreferences());
    applyDisplayPreferences({ theme: "dark", textSize: "large" });
    storageChange("{}", "hub.v1.course.example.progress");
    window.dispatchEvent(new StorageEvent("storage", { key: KEY, storageArea: sessionStorage }));
    window.dispatchEvent(new StorageEvent("storage", { key: null, storageArea: sessionStorage }));
    expect(rootAttributes()).toEqual({ theme: "dark", textSize: "large" });
  });

  it.each([false, true])("cleans up modern/legacy media and storage listeners (legacy=%s)", (legacy) => {
    const system = mockSystemTheme(false, legacy);
    const cleanup = initDisplayPreferences();
    expect(system.listeners.size).toBe(1);
    system.setDark(true);
    expect(rootAttributes().theme).toBe("dark");
    cleanup();
    cleanup();
    expect(system.listeners.size).toBe(0);
    system.setDark(false);
    storageChange(JSON.stringify({ theme: "light", textSize: "larger" }));
    expect(rootAttributes()).toEqual({ theme: "dark", textSize: "standard" });
    const secondCleanup = initDisplayPreferences();
    expect(system.listeners.size).toBe(1);
    secondCleanup();
    expect(system.listeners.size).toBe(0);
  });

  it("falls back to light without matchMedia and still accepts explicit dark", () => {
    vi.stubGlobal("matchMedia", undefined);
    cleanups.push(initDisplayPreferences());
    expect(rootAttributes().theme).toBe("light");
    applyDisplayPreferences({ theme: "dark", textSize: "larger" });
    expect(rootAttributes()).toEqual({ theme: "dark", textSize: "larger" });
  });
});

describe("standalone display settings", () => {
  it("labels current choices, applies immediately, and saves without changing progress", () => {
    saveDisplayPreferences({ theme: "dark", textSize: "large" });
    localStorage.setItem("hub.v1.course.sample-course.progress", "keep me");
    const container = render(createElement(DisplaySettings));
    const [theme, size] = Array.from(container.querySelectorAll("select"));
    expect(theme.value).toBe("dark");
    expect(size.value).toBe("large");
    expect(container.querySelector(`label[for="${theme.id}"]`)?.textContent).toBe("Theme");
    expect(container.querySelector(`label[for="${size.id}"]`)?.textContent).toBe("Reading text size");
    change(theme, "light");
    change(size, "larger");
    expect(rootAttributes()).toEqual({ theme: "light", textSize: "larger" });
    expect(loadDisplayPreferences()).toEqual({ theme: "light", textSize: "larger" });
    expect(container.querySelector('[role="status"]')?.textContent).toMatch(/saved in this browser/);
    expect(container.textContent).toMatch(/not in an account/);
    expect(localStorage.getItem("hub.v1.course.sample-course.progress")).toBe("keep me");
  });

  it("shows an honest warning for corrupt data and storage failures", () => {
    localStorage.setItem(KEY, "{");
    const container = render(createElement(DisplaySettings));
    const status = container.querySelector('[role="status"]')!;
    expect(status.textContent).toMatch(/could not be read/);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("full"); });
    change(container.querySelector("select")!, "dark");
    expect(rootAttributes().theme).toBe("dark");
    expect(status.textContent).toMatch(/could not save/);
    expect(status.textContent).not.toMatch(/saved in this browser/);
  });

  it("notifies about unavailable reads instead of pretending defaults were saved", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("denied"); });
    const container = render(createElement(DisplaySettings));
    expect(container.querySelector('[role="status"]')?.textContent).toMatch(/could not read/);
    expect(rootAttributes()).toEqual({ theme: "light", textSize: "standard" });
  });

  it("keeps selects current when another tab changes preferences", () => {
    cleanups.push(initDisplayPreferences());
    const container = render(createElement(DisplaySettings));
    act(() => storageChange(JSON.stringify({ theme: "dark", textSize: "larger" })));
    const [theme, size] = Array.from(container.querySelectorAll("select"));
    expect(theme.value).toBe("dark");
    expect(size.value).toBe("larger");
  });
});

describe("course picker", () => {
  const course: CourseMeta = {
    id: "course", title: "Real course", shortTitle: "Course", description: "Practice and review.",
    exam: { questions: 8, minutes: 15, passPercent: 60 },
  };
  const sample: CourseMeta = { ...course, id: "sample", title: "Academic Skills (Sample)", sample: true };

  it("puts real courses first, separates samples, and preserves opening buttons and private link", () => {
    const onOpen = vi.fn();
    const onSettings = vi.fn();
    const courses = [sample, course];
    const container = render(createElement(CoursePicker, { courses, onOpen, onSettings }));
    const buttons = container.querySelectorAll<HTMLButtonElement>(".course-card[type=button]");
    expect(buttons[0].textContent).toContain("Real course");
    expect(buttons[1].textContent).toContain("Academic Skills (Sample)");
    expect(buttons[1].closest("section")?.textContent).toContain("Try a sample");
    act(() => buttons[1].click());
    expect(onOpen).toHaveBeenCalledWith("sample");
    const settings = Array.from(container.querySelectorAll("button"))
      .find((button) => button.textContent === "Display preferences")!;
    act(() => settings.click());
    expect(onSettings).toHaveBeenCalledOnce();
    const privateLink = container.querySelector<HTMLAnchorElement>("a.private-site")!;
    expect(privateLink.href).toBe("https://nplus.aizat.my/");
    expect(privateLink.textContent).toContain("CompTIA Network+ Trainer");
    expect(privateLink.textContent).toContain("Sign-in required");
    expect(courses).toEqual([sample, course]);
  });

  it("has a student-facing empty state and no unavailable settings button", () => {
    const container = render(createElement(CoursePicker, { courses: [], onOpen: vi.fn() }));
    expect(container.textContent).toContain("No courses are available right now");
    expect(container.textContent).not.toMatch(/src\/courses|course\.json|rebuild|Display preferences/);
    expect(container.querySelector(".picker-samples")).toBeNull();
  });
});
