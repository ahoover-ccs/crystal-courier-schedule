import type { AppData } from "./types";

/** Re-clear slots for approved time off (e.g. after rebuilding the week grid). Skips slots with a persisted slotOverrides entry so manual coverage wins. */
export function reapplyApprovedTimeOffToSlots(data: AppData): AppData {
  const slots = data.slots.map((s) => ({ ...s }));
  const approved = data.timeOffRequests.filter((r) => r.status === "approved");

  for (const req of approved) {
    for (let i = 0; i < slots.length; i++) {
      const s = slots[i];
      if (s.date !== req.date) continue;
      if (!req.routeTypes.includes(s.routeType)) continue;
      if (data.slotOverrides?.[s.id]) continue;
      if (s.driverId !== req.driverId) continue;
      slots[i] = {
        ...s,
        driverId: null,
        isGap: true,
        gapReason: `Time off — ${req.driverName}`,
        gapForDriverId: req.driverId,
      };
    }
  }

  return { ...data, slots };
}
