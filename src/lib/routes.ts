import type { View } from "../types";

export type Route = { kind: "picker" } | { kind: "settings" } | { kind: "missing" } |
  { kind: "course"; id: string; view: View; detail?: string };
const VIEWS: View[] = ["home", "quiz", "summary", "review", "exam", "library", "lab", "learn", "settings"];

export function readRoute(hash = window.location.hash): Route {
  const path = hash.replace(/^#\/?/, "");
  if (!path) return { kind: "picker" };
  if (path === "settings") return { kind: "settings" };
  const match = /^c\/([A-Za-z0-9_-]+)(?:\/([a-z]+)(?:\/([^/]+))?)?$/.exec(path);
  if (!match) return { kind: "missing" };
  const view = (match[2] ?? "home") as View;
  if (!VIEWS.includes(view)) return { kind: "missing" };
  try {
    return { kind: "course", id: match[1], view, ...(match[3] ? { detail: decodeURIComponent(match[3]) } : {}) };
  } catch { return { kind: "missing" }; }
}

export function courseUrl(id: string, view: View = "home", detail?: string): string {
  return `#/c/${encodeURIComponent(id)}${view === "home" && !detail ? "" : `/${view}`}${detail ? `/${encodeURIComponent(detail)}` : ""}`;
}

export function navigateCourse(id: string, view: View = "home", detail?: string) {
  window.location.hash = courseUrl(id, view, detail);
}
