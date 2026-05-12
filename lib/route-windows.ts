import type { RouteType } from "./types";

/** Half-open interval [startMin, endMin) in minutes from midnight */
export function routeWindow(routeType: RouteType): { start: number; end: number } {
  switch (routeType) {
    case "lab":
      return { start: 7 * 60, end: 9 * 60 };
    case "morning":
      return { start: 9 * 60, end: 12 * 60 };
    case "afternoon":
      return { start: 12 * 60 + 30, end: 17 * 60 };
    case "allday":
    case "office":
      return { start: 9 * 60, end: 17 * 60 };
    default:
      return { start: 0, end: 0 };
  }
}

export function intervalsOverlap(
  a: { start: number; end: number },
  b: { start: number; end: number }
): boolean {
  return a.start < b.end && b.start < a.end;
}

export function slotOverlapsAssignment(
  routeType: RouteType,
  otherRouteType: RouteType
): boolean {
  return intervalsOverlap(routeWindow(routeType), routeWindow(otherRouteType));
}

export function conflictsWithDayAssignments(
  routeType: RouteType,
  existingRouteTypes: RouteType[]
): boolean {
  const w = routeWindow(routeType);
  return existingRouteTypes.some((t) => intervalsOverlap(w, routeWindow(t)));
}
