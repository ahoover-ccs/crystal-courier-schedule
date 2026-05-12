import type { AppData } from "./types";
import { canStaffOfficeSlot } from "./roles";

/** Count of distinct qualified office staff covering any office slot on this date. */
export function qualifiedOfficeCoverCount(
  data: AppData,
  date: string,
  ignoreSlotId?: string
): number {
  const ids = new Set<string>();
  for (const s of data.slots) {
    if (s.date !== date || !s.isOfficeSlot || !s.driverId) continue;
    if (s.id === ignoreSlotId) continue;
    const p = data.people.find((x) => x.id === s.driverId);
    if (p && canStaffOfficeSlot(p)) ids.add(p.id);
  }
  return ids.size;
}

export function hasOfficeSlotsOnDate(data: AppData, date: string): boolean {
  return data.slots.some((s) => s.date === date && s.isOfficeSlot);
}
