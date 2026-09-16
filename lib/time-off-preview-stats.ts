import { format, parseISO, subMonths, subYears } from "date-fns";
import { resolveTemplateLabel } from "./availability-helpers";
import { slotsForDate } from "./schedule-for-date";
import { isSpecialRouteSlotId } from "./special-routes";
import { templateIdFromSlotId } from "./slot-overrides";
import type { AppData, RouteType, TimeOffRequest } from "./types";

const ACTIVE_TIME_OFF: ReadonlySet<TimeOffRequest["status"]> = new Set([
  "pending",
  "approved",
]);

function isAmRoute(type: RouteType): boolean {
  return type === "morning";
}

function isPmRoute(type: RouteType): boolean {
  return type === "afternoon";
}

/** Whether existing time off (or a gap) should count as "out" during `requested`. */
export function timeOffCoversRouteType(
  offTypes: readonly RouteType[],
  requested: RouteType
): boolean {
  if (offTypes.includes(requested)) return true;
  if (requested !== "lab" && offTypes.includes("allday")) return true;
  return false;
}

/**
 * AM = ½ day, PM = ½ day, all-day = 1 day.
 * Lab, opener, and closer do not count. Morning+afternoon on the same date is one full day.
 */
export function absenceDayFraction(routeTypes: Iterable<RouteType>): number {
  const types = new Set<RouteType>(routeTypes);
  if (types.has("allday")) return 1;
  const am = [...types].some(isAmRoute);
  const pm = [...types].some(isPmRoute);
  if (am && pm) return 1;
  if (am || pm) return 0.5;
  return 0;
}

export function isEmployedLessThanOneYear(
  hiredAt: string | undefined,
  asOfISO: string
): boolean {
  if (!hiredAt || !/^\d{4}-\d{2}-\d{2}$/.test(hiredAt)) return false;
  const asOf = parseISO(asOfISO);
  if (Number.isNaN(asOf.getTime())) return false;
  const oneYearBefore = format(subYears(asOf, 1), "yyyy-MM-dd");
  return hiredAt > oneYearBefore;
}

function dateFromSlotId(slotId: string): string {
  const sep = slotId.indexOf("__");
  return sep === -1 ? slotId : slotId.slice(0, sep);
}

function routeTypeFromSlotId(data: AppData, slotId: string): RouteType | null {
  if (isSpecialRouteSlotId(slotId)) {
    const spec = (data.specialRoutes ?? []).find((r) => `${r.date}__${r.id}` === slotId);
    return spec?.routeType ?? null;
  }
  const template = data.settings.slotTemplates.find((t) => t.id === templateIdFromSlotId(slotId));
  if (!template) return null;
  return resolveTemplateLabel(template, data.settings.routeDefinitions).routeType;
}

function addTypes(
  byDate: Map<string, Set<RouteType>>,
  date: string,
  types: Iterable<RouteType>
): void {
  let set = byDate.get(date);
  if (!set) {
    set = new Set();
    byDate.set(date, set);
  }
  for (const t of types) set.add(t);
}

/** Distinct half/full days in the trailing N months the person was out. */
export function trailingMonthsAbsenceDayCount(
  data: AppData,
  personId: string,
  months: number,
  throughDateISO: string
): number {
  const through = new Date(throughDateISO + "T12:00:00");
  const from = subMonths(through, months);
  const fromISO = format(from, "yyyy-MM-dd");
  const byDate = new Map<string, Set<RouteType>>();

  for (const r of data.timeOffRequests) {
    if (r.driverId !== personId || r.status !== "approved") continue;
    if (r.date < fromISO || r.date > throughDateISO) continue;
    addTypes(byDate, r.date, r.routeTypes);
  }

  if (data.slotOverrides) {
    for (const [slotId, o] of Object.entries(data.slotOverrides)) {
      if (o.gapForDriverId !== personId) continue;
      const date = dateFromSlotId(slotId);
      if (date < fromISO || date > throughDateISO) continue;
      const rt = routeTypeFromSlotId(data, slotId);
      if (rt) addTypes(byDate, date, [rt]);
    }
  }

  for (const s of data.slots) {
    if (s.gapForDriverId !== personId) continue;
    if (s.date < fromISO || s.date > throughDateISO) continue;
    addTypes(byDate, s.date, [s.routeType]);
  }

  let total = 0;
  for (const types of byDate.values()) {
    total += absenceDayFraction(types);
  }
  return total;
}

function peopleOutForRouteType(
  data: AppData,
  date: string,
  routeType: RouteType,
  excludePersonId: string
): Set<string> {
  const ids = new Set<string>();

  for (const r of data.timeOffRequests) {
    if (!ACTIVE_TIME_OFF.has(r.status)) continue;
    if (r.driverId === excludePersonId) continue;
    if (r.date !== date) continue;
    if (timeOffCoversRouteType(r.routeTypes, routeType)) ids.add(r.driverId);
  }

  for (const slot of slotsForDate(data, date)) {
    const outId = slot.gapForDriverId;
    if (!outId || outId === excludePersonId) continue;
    if (timeOffCoversRouteType([slot.routeType], routeType)) ids.add(outId);
  }

  return ids;
}

/**
 * Unique people already out during `requestedTypes` on this date.
 * Uses the busiest requested shift (max), not the sum across shifts.
 * Counts pending and approved time-off requests (including owners/managers
 * with no route assignment) plus recorded schedule gaps.
 */
export function othersOutOnDate(
  data: AppData,
  date: string,
  excludePersonId: string,
  requestedTypes: RouteType[]
): number {
  let max = 0;
  for (const t of requestedTypes) {
    max = Math.max(max, peopleOutForRouteType(data, date, t, excludePersonId).size);
  }
  return max;
}

export function maxOthersOutInRange(
  data: AppData,
  dates: string[],
  excludePersonId: string,
  requestedTypes: RouteType[]
): number {
  let max = 0;
  for (const d of dates) {
    max = Math.max(max, othersOutOnDate(data, d, excludePersonId, requestedTypes));
  }
  return max;
}
