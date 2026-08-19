import { appendActivity } from "./activity-log";
import { effectiveDefaultDriverForDate } from "./person-roster-dates";
import { isRouteActiveOnDate } from "./route-catalog";
import { resolveTemplateLabel } from "./availability-helpers";
import { refreshSlotOverrideFromSlot, templateIdFromSlotId } from "./slot-overrides";
import type { AppData, TimeOffRequest } from "./types";

function restoreSlotAfterCancelledTimeOff(
  data: AppData,
  req: TimeOffRequest,
  slotIndex: number
): void {
  const slot = data.slots[slotIndex];
  if (slot.date !== req.date) return;
  if (!req.routeTypes.includes(slot.routeType)) return;
  if (slot.driverId && slot.driverId !== req.driverId) return;

  const t = data.settings.slotTemplates.find((x) => x.id === templateIdFromSlotId(slot.id));
  const def = t ? effectiveDefaultDriverForDate(data, slot.date, t) : null;
  const restoreId = slot.driverId === req.driverId ? slot.driverId : def === req.driverId ? def : null;

  data.slots[slotIndex] = {
    ...slot,
    driverId: restoreId,
    isGap: false,
    gapReason: undefined,
    absenceType: undefined,
    gapForDriverId: null,
  };
  refreshSlotOverrideFromSlot(data, data.slots[slotIndex]);
}

/** Drop saved time-off gaps for this request on dates that are not in the loaded week. */
function clearTimeOffGapOverridesForRequest(data: AppData, req: TimeOffRequest): void {
  if (!data.slotOverrides) return;
  const loaded = new Set(data.slots.map((s) => s.id));
  const next = { ...data.slotOverrides };

  for (const t of data.settings.slotTemplates) {
    const defn = data.settings.routeDefinitions.find((d) => d.id === t.routeDefinitionId);
    if (defn && !isRouteActiveOnDate(defn, req.date)) continue;
    const { routeType } = resolveTemplateLabel(t, data.settings.routeDefinitions);
    if (!req.routeTypes.includes(routeType)) continue;

    const slotId = `${req.date}__${t.id}`;
    if (loaded.has(slotId)) continue;
    const o = next[slotId];
    if (!o) continue;
    if (o.driverId && o.driverId !== req.driverId) continue;
    if (o.isGap && o.gapForDriverId === req.driverId) {
      delete next[slotId];
    }
  }

  data.slotOverrides = Object.keys(next).length ? next : undefined;
}

export function withdrawApprovedTimeOffRequest(
  data: AppData,
  req: TimeOffRequest,
  actorName?: string
): void {
  if (req.status !== "approved") return;
  req.status = "cancelled";

  for (let i = 0; i < data.slots.length; i++) {
    restoreSlotAfterCancelledTimeOff(data, req, i);
  }
  clearTimeOffGapOverridesForRequest(data, req);

  appendActivity(data, {
    category: "time_off",
    summary: actorName
      ? `Time off cancelled: ${req.driverName} on ${req.date} (by ${actorName})`
      : `Time off cancelled: ${req.driverName} on ${req.date} — returned to the board`,
    detail: req.routeTypes.join(", "),
  });
}

/** Cancel every approved request for this person on this date (they came back to work). */
export function withdrawApprovedTimeOffForPersonOnDate(
  data: AppData,
  personId: string,
  date: string,
  actorName?: string
): void {
  for (const row of data.timeOffRequests) {
    if (row.status !== "approved") continue;
    if (row.driverId !== personId) continue;
    if (row.date !== date) continue;
    withdrawApprovedTimeOffRequest(data, row, actorName);
  }
}
