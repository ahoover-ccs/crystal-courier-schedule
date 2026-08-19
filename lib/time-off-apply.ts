import { plannedTimeOffGapReason } from "./absence-labels";
import { resolveTemplateLabel } from "./availability-helpers";
import { effectiveDefaultDriverForDate } from "./person-roster-dates";
import { isRouteActiveOnDate } from "./route-catalog";
import { refreshSlotOverrideFromSlot, templateIdFromSlotId } from "./slot-overrides";
import type { AppData, ScheduleSlot, TimeOffRequest } from "./types";

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

function coveredBySomeoneElse(
  driverId: string | null | undefined,
  req: TimeOffRequest
): boolean {
  return Boolean(driverId && driverId !== req.driverId);
}

/**
 * Re-clear slots for approved time off (e.g. after rebuilding the week grid).
 * Manual coverage wins: a different person already on the cell is left alone.
 */
export function reapplyApprovedTimeOffToSlots(data: AppData): AppData {
  const slots = data.slots.map((s) => ({ ...s }));
  const next: AppData = { ...data, slots };
  const approved = data.timeOffRequests.filter((r) => r.status === "approved");

  for (const req of approved) {
    for (let i = 0; i < slots.length; i++) {
      const s = slots[i];
      if (s.date !== req.date) continue;
      if (!req.routeTypes.includes(s.routeType)) continue;
      if (coveredBySomeoneElse(s.driverId, req)) continue;
      if (s.isGap && s.gapForDriverId === req.driverId) continue;

      const belongsToPerson = s.driverId === req.driverId;
      if (!belongsToPerson) {
        const t = data.settings.slotTemplates.find(
          (x) => x.id === templateIdFromSlotId(s.id)
        );
        const defaultId = t ? effectiveDefaultDriverForDate(data, s.date, t) : null;
        if (!(s.driverId == null && defaultId === req.driverId)) continue;
      }

      slots[i] = toTimeOffGap(s, req);
      refreshSlotOverrideFromSlot(next, slots[i]);
    }
  }

  for (const req of approved) {
    persistApprovedTimeOffOverridesForRequest(next, req);
  }

  return next;
}

/**
 * Save time-off gaps for the request date even when that week is not loaded in
 * `data.slots` (the board only keeps one week in memory).
 */
export function persistApprovedTimeOffOverridesForRequest(
  data: AppData,
  req: TimeOffRequest
): void {
  for (const t of data.settings.slotTemplates) {
    const defn = data.settings.routeDefinitions.find((d) => d.id === t.routeDefinitionId);
    if (defn && !isRouteActiveOnDate(defn, req.date)) continue;
    const { routeType } = resolveTemplateLabel(t, data.settings.routeDefinitions);
    if (!req.routeTypes.includes(routeType)) continue;

    const slotId = `${req.date}__${t.id}`;
    const override = data.slotOverrides?.[slotId];
    if (coveredBySomeoneElse(override?.driverId, req)) continue;
    if (override?.isGap && override.gapForDriverId === req.driverId) continue;

    const defaultId = effectiveDefaultDriverForDate(data, req.date, t);
    const currentDriver = override ? override.driverId : defaultId;
    if (currentDriver !== req.driverId) continue;

    data.slotOverrides = {
      ...(data.slotOverrides ?? {}),
      [slotId]: {
        driverId: null,
        isGap: true,
        absenceType: "planned",
        gapReason: plannedTimeOffGapReason(req.driverName),
        gapForDriverId: req.driverId,
      },
    };
  }
}
