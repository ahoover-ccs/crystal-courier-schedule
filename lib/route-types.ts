import type { RouteType } from "./types";

export const ADDON_ROUTE_TYPES = ["opener", "closer"] as const satisfies readonly RouteType[];

/** Opener/closer never overlap other routes on the same day (availability is still per-person). */
export function isAddonRouteType(routeType: RouteType): boolean {
  return routeType === "opener" || routeType === "closer";
}

const ROUTE_TYPE_VALUES: RouteType[] = [
  "lab",
  "morning",
  "afternoon",
  "allday",
  "opener",
  "closer",
];

/** Migrate legacy persisted values (e.g. removed shift types) to a valid RouteType. */
export function migrateRouteType(raw: string): RouteType {
  if (raw === "office") return "allday";
  if (ROUTE_TYPE_VALUES.includes(raw as RouteType)) return raw as RouteType;
  return "morning";
}

export const ROUTE_TYPE_CATALOG_OPTIONS: { value: RouteType; label: string }[] = [
  { value: "lab", label: "Lab" },
  { value: "morning", label: "Morning" },
  { value: "afternoon", label: "Afternoon" },
  { value: "allday", label: "All day" },
  { value: "opener", label: "Opener" },
  { value: "closer", label: "Closer" },
];

export const SHIFT_AVAILABILITY_ROUTE_TYPES = ROUTE_TYPE_CATALOG_OPTIONS;

export const ALL_ROUTE_TYPES: RouteType[] = ROUTE_TYPE_CATALOG_OPTIONS.map((o) => o.value);

export const ROUTE_TYPE_SHORT_LABELS: Record<RouteType, string> = {
  lab: "Lab",
  morning: "AM",
  afternoon: "PM",
  allday: "All day",
  opener: "Open",
  closer: "Close",
};

export const ROUTE_TYPE_TIME_OFF_LABELS: Record<RouteType, string> = {
  lab: "Lab run (early)",
  morning: "Morning route",
  afternoon: "Afternoon route",
  allday: "All day route",
  opener: "Opener",
  closer: "Closer",
};

export const SHIFT_AVAILABILITY_ABBR: Record<RouteType, string> = {
  lab: "L",
  morning: "AM",
  afternoon: "PM",
  allday: "AD",
  opener: "Op",
  closer: "Cl",
};
