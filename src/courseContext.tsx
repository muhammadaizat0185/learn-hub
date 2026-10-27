import { createContext, useContext } from "react";
import type { ReactNode } from "react";
import type { CourseData } from "./types";

const CourseContext = createContext<CourseData | null>(null);

export function CourseProvider({ data, children }: { data: CourseData; children: ReactNode }) {
  return <CourseContext.Provider value={data}>{children}</CourseContext.Provider>;
}

export function useCourse(): CourseData {
  const course = useContext(CourseContext);
  if (!course) throw new Error("useCourse must be used inside a course.");
  return course;
}
