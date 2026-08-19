import { plannedTimeOffGapReason } from "./absence-labels";
import { resolveTemplateLabel } from "./availability-helpers";
import { effectiveDefaultDriverForDate } from "./person-roster-dates";
import { isRouteActiveOnDate } from "./route-catalog";
import {
  mergeSlotOverridesIntoSlots,
  refreshSlotOverrideFromSlot,
} from "./slot-overrides";
import { specialRouteSlotId } from "./special-routes";
import type { AppData, ScheduleSlot, SlotTemplate, TimeOffRequest } from "./types";
import { WEEKDAY_KEYS } from "./types";

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

function personIsUsualDefault(template: SlotTemplate, personId: string): boolean {
  return WEEKDAY_KEYS.some((d) => template.defaultDriversByDay[d] === personId);
}

function writeGapOverride(data: AppData, slot: ScheduleSlot): void {
  refreshSlotOverrideFromSlot(data, slot);
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
  const slotId = `${req.date}__${template.id}`;
  const slot: ScheduleSlot = {
    id: slotId,
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

/**
 * Open this person's usual/assigned cells for an approved time-off row.
 * Coverage by someone else is left in place. Mutates `data`.
 */
export function applyTimeOffRequestToBoard(data: AppData, req: TimeOffRequest): number {
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
    if (coveredBySomeoneElse(assigned, req)) continue;
    if (
      (slot?.isGap && slot.gapForDriverId === req.driverId) ||
      (override?.isGap && override.gapForDriverId === req.driverId && !assigned)
    ) {
      if (slot) writeGapOverride(data, toTimeOffGap(slot, req));
      continue;
    }

    const defaultId = effectiveDefaultDriverForDate(data, req.date, t);
    const belongs =
      assigned === req.driverId ||
      defaultId === req.driverId ||
      (!assigned && personIsUsualDefault(t, req.driverId));
    if (!belongs) continue;

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
    const belongs = assigned === req.driverId || (!assigned && slot);
    if (!belongs && assigned) continue;
    if (!slot && !assigned) continue;
    if (assigned === req.driverId || (slot && !assigned)) {
      if (gapLoadedSlot(data, slotId, req)) opened += 1;
    }
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
