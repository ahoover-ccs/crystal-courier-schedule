import {
  defaultDriverForTemplateDate,
  isPersonAvailableForSlotOnDate,
  slotTemplateForSlot,
} from "./availability-helpers";
import { canStaffOfficeSlot } from "./roles";
import type { AppData, Person, RouteType, ScheduleSlot } from "./types";
import { conflictsWithDayAssignments } from "./route-windows";

/** True if `personId` has an approved time-off request that covers this date + route type. */
export function hasApprovedTimeOffForSlot(
  data: AppData,
  personId: string,
  date: string,
  routeType: RouteType
): boolean {
  return data.timeOffRequests.some(
    (r) =>
      r.status === "approved" &&
      r.driverId === personId &&
      r.date === date &&
      r.routeTypes.includes(routeType)
  );
}

export function assignmentsForDriverOnDate(
  slots: ScheduleSlot[],
  date: string,
  driverId: string,
  excludeSlotId?: string
): RouteType[] {
  return slots
    .filter(
      (s) =>
        s.date === date &&
        s.driverId === driverId &&
        s.id !== excludeSlotId
    )
    .map((s) => s.routeType);
}

/** Ops manager and owner are last-resort fill-ins: always appended after the primary list. */
function isLowPriorityFillRole(p: Person): boolean {
  return p.role === "ops_manager" || p.role === "owner";
}

export function suggestFillIns(
  data: AppData,
  slot: ScheduleSlot,
  /** Caps the primary (driver + dispatch) list; managerial roles are always appended. Omit for no cap. */
  limit?: number
): Person[] {
  const { people, slots, settings } = data;
  const existingTypes = (driverId: string) =>
    assignmentsForDriverOnDate(slots, slot.date, driverId, slot.id);

  const priorityOrder = [...settings.fillPriorityIds];
  const byPriority = (list: Person[]) =>
    [...list].sort((a, b) => {
      const ia = priorityOrder.indexOf(a.id);
      const ib = priorityOrder.indexOf(b.id);
      const sa = ia === -1 ? 999 : ia;
      const sb = ib === -1 ? 999 : ib;
      if (sa !== sb) return sa - sb;
      return a.name.localeCompare(b.name);
    });

  const template = slotTemplateForSlot(data, slot);
  const defaultDriverId = template ? defaultDriverForTemplateDate(slot.date, template) : null;
  /** If the default assignee is not on this slot, treat them as unavailable for fill-in here. */
  const excludeDefault =
    defaultDriverId != null && slot.driverId !== defaultDriverId;

  const passesFilters = (p: Person): boolean => {
    if (excludeDefault && p.id === defaultDriverId) return false;
    if (slot.isOfficeSlot && !canStaffOfficeSlot(p)) return false;
    if (!isPersonAvailableForSlotOnDate(p, slot.date, slot.routeType)) return false;
    if (hasApprovedTimeOffForSlot(data, p.id, slot.date, slot.routeType)) return false;
    const busyTypes = existingTypes(p.id);
    if (conflictsWithDayAssignments(slot.routeType, busyTypes)) return false;
    return true;
  };

  const cap = limit ?? Infinity;
  const primary: Person[] = [];
  for (const p of byPriority(people.filter((x) => !isLowPriorityFillRole(x)))) {
    if (primary.length >= cap) break;
    if (passesFilters(p)) primary.push(p);
  }

  const managerial = byPriority(people.filter(isLowPriorityFillRole)).filter(passesFilters);

  return [...primary, ...managerial];
}

export function canAssignDriver(
  data: AppData,
  slotId: string,
  driverId: string | null
): { ok: true } | { ok: false; reason: string } {
  if (driverId === null) return { ok: true };
  const slot = data.slots.find((s) => s.id === slotId);
  if (!slot) return { ok: false, reason: "Slot not found" };
  const person = data.people.find((p) => p.id === driverId);
  if (!person) return { ok: false, reason: "Person not found" };
  if (slot.isOfficeSlot && !canStaffOfficeSlot(person)) {
    return {
      ok: false,
      reason: "Office routes require Ops Manager, Dispatch, or Owner.",
    };
  }
  const busyTypes = assignmentsForDriverOnDate(data.slots, slot.date, driverId, slotId);
  if (conflictsWithDayAssignments(slot.routeType, busyTypes)) {
    return {
      ok: false,
      reason: "That person already has a route that overlaps this time window.",
    };
  }
  return { ok: true };
}
