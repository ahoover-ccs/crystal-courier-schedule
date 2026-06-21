import type { RouteType } from "./types";

export const ADDON_ROUTE_TYPES = ["opener", "closer"] as const satisfies readonly RouteType[];

export function isAddonRouteType(routeType: RouteType): boolean {
  return routeType === "opener" || routeType === "closer";
}

export const ROUTE_TYPE_CATALOG_OPTIONS: { value: RouteType; label: string }[] = [
  { value: "lab", label: "Lab" },
  { value: "morning", label: "Morning" },
  { value: "afternoon", label: "Afternoon" },
  { value: "allday", label: "All day" },
  { value: "office", label: "Office" },
  { value: "opener", label: "Opener" },
  { value: "closer", label: "Closer" },
];

/** Shift types shown in per-person availability grids (excludes universal add-on shifts). */
export const SHIFT_AVAILABILITY_ROUTE_TYPES = ROUTE_TYPE_CATALOG_OPTIONS.filter(
  (o) => !isAddonRouteType(o.value)
);

export const ROUTE_TYPE_SHORT_LABELS: Record<RouteType, string> = {
  lab: "Lab",
  morning: "AM",
  afternoon: "PM",
  allday: "All day",
  office: "Office",
  opener: "Open",
  closer: "Close",
};

export const ROUTE_TYPE_TIME_OFF_LABELS: Record<RouteType, string> = {
  lab: "Lab run (early)",
  morning: "Morning route",
  afternoon: "Afternoon route",
  allday: "All day route",
  office: "Office",
  opener: "Opener",
  closer: "Closer",
};

export const STANDARD_ROUTE_TYPES: RouteType[] = [
  "lab",
  "morning",
  "afternoon",
  "allday",
  "office",
];
