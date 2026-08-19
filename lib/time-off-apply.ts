import { plannedTimeOffGapReason } from "./absence-labels";
import { dateToWeekdayKey, resolveTemplateLabel } from "./availability-helpers";
import { effectiveDefaultDriverForDate } from "./person-roster-dates";
import { isRouteActiveOnDate } from "./route-catalog";
import {
  mergeSlotOverridesIntoSlots,
  refreshSlotOverrideFromSlot,
} from "./slot-overrides";
import { specialRouteSlotId } from "./special-routes";
import type { AppData, ScheduleSlot, SlotOverrideState, SlotTemplate, TimeOffRequest } from "./types";

function toTimeOffGap(slot: ScheduleSlot, req: TimeOffRequest): ScheduleSlot {
  return {
    ...slot,
    driverId: null,
    isGap: true,
    absenceType: "planned",
    gapReason: plannedTimeOffGapReason(req.driverName),
    gapForDriverId: req.driverId,
  };
}

function coveredBySomeoneElse(driverId: string | null | undefined, req: TimeOffRequest): boolean {
  return Boolean(driverId && driverId !== req.driverId);
}

function writeGapOverride(data: AppData, slot: ScheduleSlot): void {
  refreshSlotOverrideFromSlot(data, slot);
}

function deleteOverride(data: AppData, slotId: string): void {
  if (!data.slotOverrides || !(slotId in data.slotOverrides)) return;
  const next = { ...data.slotOverrides };
  delete next[slotId];
  data.slotOverrides = Object.keys(next).length ? next : undefined;
}

function restoreWeekdayDefault(
  data: AppData,
  slotId: string,
  date: string,
  template: SlotTemplate
): void {
  const def = effectiveDefaultDriverForDate(data, date, template);
  const i = data.slots.findIndex((s) => s.id === slotId);
  if (i >= 0) {
    data.slots[i] = {
      ...data.slots[i],
      driverId: def,
      isGap: false,
      gapReason: undefined,
      absenceType: undefined,
      gapForDriverId: null,
    };
    refreshSlotOverrideFromSlot(data, data.slots[i]);
    return;
  }
  deleteOverride(data, slotId);
}

function isTimeOffGapForPerson(
  slot: ScheduleSlot | undefined,
  override: SlotOverrideState | undefined,
  req: TimeOffRequest
): boolean {
  if (slot?.isGap && slot.gapForDriverId === req.driverId) return true;
  if (override?.isGap && override.gapForDriverId === req.driverId && !slot?.driverId) return true;
  return false;
}

function gapLoadedSlot(data: AppData, slotId: string, req: TimeOffRequest): boolean {
  const i = data.slots.findIndex((s) => s.id === slotId);
  if (i === -1) return false;
  data.slots[i] = toTimeOffGap(data.slots[i], req);
  writeGapOverride(data, data.slots[i]);
  return true;
}

function gapUnloadedTemplate(
  data: AppData,
  req: TimeOffRequest,
  template: SlotTemplate,
  routeType: ScheduleSlot["routeType"],
  label: string
): void {
  const slot: ScheduleSlot = {
    id: `${req.date}__${template.id}`,
    date: req.date,
    routeType,
    label,
    driverId: null,
    isGap: true,
    isOfficeSlot: false,
    absenceType: "planned",
    gapReason: plannedTimeOffGapReason(req.driverName),
    gapForDriverId: req.driverId,
  };
  writeGapOverride(data, slot);
}

function clearTimeOffGapsForRequestDate(data: AppData, req: TimeOffRequest): void {
  if (data.slotOverrides) {
    const next = { ...data.slotOverrides };
    for (const id of Object.keys(next)) {
      if (!id.startsWith(`${req.date}__`)) continue;
      const o = next[id];
      if (o.isGap && o.gapForDriverId === req.driverId && !o.driverId) delete next[id];
    }
    data.slotOverrides = Object.keys(next).length ? next : undefined;
  }
  for (let i = 0; i < data.slots.length; i++) {
    const s = data.slots[i];
    if (s.date !== req.date) continue;
    if (s.gapForDriverId !== req.driverId) continue;
    if (s.driverId && s.driverId !== req.driverId) continue;
    data.slots[i] = {
      ...s,
      driverId: null,
      isGap: false,
      gapReason: undefined,
      absenceType: undefined,
      gapForDriverId: null,
    };
    refreshSlotOverrideFromSlot(data, data.slots[i]);
  }
}

/**
 * Open this person's assigned or weekday-default cells for an approved time-off row.
 * Someone else's default or coverage is left in place. Mutates `data`.
 */
export function applyTimeOffRequestToBoard(data: AppData, req: TimeOffRequest): number {
  if (!dateToWeekdayKey(req.date)) {
    clearTimeOffGapsForRequestDate(data, req);
    return 0;
  }

  let opened = 0;

  for (const t of data.settings.slotTemplates) {
    const defn = data.settings.routeDefinitions.find((d) => d.id === t.routeDefinitionId);
    if (defn && !isRouteActiveOnDate(defn, req.date)) continue;
    const { routeType, label } = resolveTemplateLabel(t, data.settings.routeDefinitions);
    if (!req.routeTypes.includes(routeType)) continue;

    const slotId = `${req.date}__${t.id}`;
    const slot = data.slots.find((s) => s.id === slotId);
    const override = data.slotOverrides?.[slotId];
    const assigned = slot?.driverId ?? override?.driverId ?? null;
    const defaultId = effectiveDefaultDriverForDate(data, req.date, t);
    const belongsToPerson = assigned === req.driverId || defaultId === req.driverId;

    if (isTimeOffGapForPerson(slot, override, req) && !belongsToPerson) {
      restoreWeekdayDefault(data, slotId, req.date, t);
      continue;
    }
    if (coveredBySomeoneElse(assigned, req)) continue;
    if (isTimeOffGapForPerson(slot, override, req) && belongsToPerson) {
      if (slot) writeGapOverride(data, toTimeOffGap(slot, req));
      continue;
    }
    if (!belongsToPerson) continue;

    if (gapLoadedSlot(data, slotId, req)) {
      opened += 1;
    } else {
      gapUnloadedTemplate(data, req, t, routeType, label);
      opened += 1;
    }
  }

  for (const sr of data.specialRoutes ?? []) {
    if (sr.date !== req.date) continue;
    if (!req.routeTypes.includes(sr.routeType)) continue;
    const slotId = specialRouteSlotId(sr);
    const slot = data.slots.find((s) => s.id === slotId);
    const override = data.slotOverrides?.[slotId];
    const assigned = slot?.driverId ?? override?.driverId ?? null;
    if (coveredBySomeoneElse(assigned, req)) continue;
    if (assigned !== req.driverId) continue;
    if (gapLoadedSlot(data, slotId, req)) opened += 1;
  }

  return opened;
}

export function persistApprovedTimeOffOverridesForRequest(
  data: AppData,
  req: TimeOffRequest
): void {
  applyTimeOffRequestToBoard(data, req);
}

/**
 * Re-clear slots for approved time off (e.g. after rebuilding the week grid).
 * Manual coverage wins: a different person already on the cell is left alone.
 */
export function reapplyApprovedTimeOffToSlots(data: AppData): AppData {
  const next: AppData = { ...data, slots: data.slots.map((s) => ({ ...s })) };
  const approved = data.timeOffRequests.filter((r) => r.status === "approved");
  for (const req of approved) {
    applyTimeOffRequestToBoard(next, req);
  }
  next.slots = mergeSlotOverridesIntoSlots(next.slots, next.slotOverrides);
  return next;
}
