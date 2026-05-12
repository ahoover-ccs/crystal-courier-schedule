import { refreshSlotOverridesForSlots } from "./slot-overrides";
import type { AppData, TimeOffRequest } from "./types";

/** Apply one approved time-off row to slots (mutates `data`). Returns count of assignments cleared. */
export function applyApprovedTimeOffRequestToData(
  data: AppData,
  req: TimeOffRequest
): number {
  let cleared = 0;
  const d = req.date;
  for (let i = 0; i < data.slots.length; i++) {
    const s = data.slots[i];
    if (s.date !== d) continue;
    if (!req.routeTypes.includes(s.routeType)) continue;
    if (s.driverId !== req.driverId) continue;
    data.slots[i] = {
      ...s,
      driverId: null,
      isGap: true,
      gapReason: `Time off — ${req.driverName}`,
      gapForDriverId: req.driverId,
    };
    cleared += 1;
  }
  refreshSlotOverridesForSlots(data, data.slots.filter((s) => s.date === d));
  return cleared;
}
