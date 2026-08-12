import type { AppData, RouteType, ScheduleSlot, SpecialRoute } from "./types";
import { isWeekdayISO, weekWorkdaysFromWeekStart } from "./week-utils";

export const SPECIAL_ROUTE_TYPES: { value: RouteType; label: string }[] = [
  { value: "lab", label: "Lab" },
  { value: "morning", label: "AM" },
  { value: "afternoon", label: "PM" },
  { value: "allday", label: "All Day" },
];

const SPECIAL_TYPE_SET = new Set<RouteType>(SPECIAL_ROUTE_TYPES.map((o) => o.value));

export function isSpecialRouteType(value: string): value is RouteType {
  return SPECIAL_TYPE_SET.has(value as RouteType);
}

export function isSpecialRouteSlotId(slotId: string): boolean {
  const i = slotId.indexOf("__");
  const suffix = i === -1 ? slotId : slotId.slice(i + 2);
  return suffix.startsWith("spec-");
}

export function specialRouteSlotId(route: SpecialRoute): string {
  return `${route.date}__${route.id}`;
}

export function slotFromSpecialRoute(route: SpecialRoute): ScheduleSlot {
  return {
    id: specialRouteSlotId(route),
    date: route.date,
    routeType: route.routeType,
    label: route.name,
    driverId: null,
    isGap: false,
    isOfficeSlot: false,
    gapForDriverId: null,
  };
}

export function specialRoutesInWeek(data: AppData, weekStart: string): SpecialRoute[] {
  const days = new Set(weekWorkdaysFromWeekStart(weekStart));
  return (data.specialRoutes ?? [])
    .filter((r) => days.has(r.date) && isWeekdayISO(r.date))
    .slice()
    .sort((a, b) =>
      a.date === b.date ? a.name.localeCompare(b.name) : a.date.localeCompare(b.date)
    );
}

export function normalizeSpecialRoutes(raw: SpecialRoute[] | undefined): SpecialRoute[] | undefined {
  if (!raw?.length) return undefined;
  const next = raw
    .filter(
      (r) =>
        r &&
        typeof r.id === "string" &&
        r.id.startsWith("spec-") &&
        /^\d{4}-\d{2}-\d{2}$/.test(r.date) &&
        typeof r.name === "string" &&
        r.name.trim() &&
        isSpecialRouteType(r.routeType)
    )
    .map((r) => ({
      id: r.id,
      date: r.date,
      routeType: r.routeType,
      name: r.name.trim(),
      createdAt: r.createdAt || new Date().toISOString(),
    }));
  return next.length ? next : undefined;
}
