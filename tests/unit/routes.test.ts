import { afterEach, describe, expect, it } from "vitest";
import { courseUrl, navigateCourse, readRoute } from "../../src/lib/routes";
import type { View } from "../../src/types";

const COURSE = "java-programming_2";
const views: View[] = ["home", "quiz", "summary", "review", "exam", "library", "lab", "learn", "settings"];

afterEach(() => window.history.replaceState(null, "", "/"));

describe("back-compatible routes", () => {
  it.each(["", "#", "#/"])("opens the picker for %j", (hash) => {
    expect(readRoute(hash)).toEqual({ kind: "picker" });
  });

  it("distinguishes global settings from course settings", () => {
    expect(readRoute("#/settings")).toEqual({ kind: "settings" });
    expect(readRoute("#/c/sample-course/settings")).toEqual({ kind: "course", id: "sample-course", view: "settings" });
  });

  it("retains the short home URL and accepts existing hash forms", () => {
    expect(courseUrl(COURSE)).toBe(`#/c/${COURSE}`);
    for (const hash of [`#/c/${COURSE}`, `#c/${COURSE}`, `c/${COURSE}`, `#/c/${COURSE}/home`]) {
      expect(readRoute(hash)).toEqual({ kind: "course", id: COURSE, view: "home" });
    }
  });

  it.each(views)("round-trips the %s view without a detail", (view) => {
    expect(readRoute(courseUrl(COURSE, view))).toEqual({ kind: "course", id: COURSE, view });
  });
});

describe("deep links", () => {
  it.each([
    ["learn", "intro-lesson"], ["lab", "loops/first"], ["library", "Focus & wellbeing"],
    ["quiz", "50% + practice?#"], ["learn", "日本語の基本"], ["home", "a detail"], ["lab", "%2F"],
  ] as const)("round-trips %s detail %j with one encoding/decoding pass", (view, detail) => {
    const url = courseUrl(COURSE, view, detail);
    expect(url).toBe(`#/c/${COURSE}/${view}/${encodeURIComponent(detail)}`);
    expect(readRoute(url)).toEqual({ kind: "course", id: COURSE, view, detail });
  });

  it("omits empty details instead of creating a trailing slash", () => {
    expect(courseUrl(COURSE, "home", "")).toBe(`#/c/${COURSE}`);
    expect(courseUrl(COURSE, "lab", "")).toBe(`#/c/${COURSE}/lab`);
  });

  it.each(["%", "%2", "%GG", "%E0%A4%A", "%C3%28", "%ED%A0%80"])("returns missing instead of throwing for invalid encoding %j", (detail) => {
    expect(readRoute(`#/c/${COURSE}/lab/${detail}`)).toEqual({ kind: "missing" });
  });

  it.each([
    "#/unknown", "#/c/", "#/c/course/unknown", "#/c/course/Lab", "#/c/course/lab/a/b",
    "#/c/course/", "#/c/course/lab/", "#/c/course.name", "#/c/%GG/lab", "#/settings/extra",
  ])("rejects an invalid route %j", (hash) => {
    expect(readRoute(hash)).toEqual({ kind: "missing" });
  });

  it("navigates using encoded details and reads the current window hash by default", () => {
    navigateCourse(COURSE, "library", "Focus & wellbeing");
    expect(window.location.hash).toBe(courseUrl(COURSE, "library", "Focus & wellbeing"));
    expect(readRoute()).toEqual({ kind: "course", id: COURSE, view: "library", detail: "Focus & wellbeing" });
    navigateCourse(COURSE);
    expect(readRoute()).toEqual({ kind: "course", id: COURSE, view: "home" });
  });
});
