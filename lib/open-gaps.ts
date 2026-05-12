import { addDays, format } from "date-fns";
import type { AppData, ScheduleSlot } from "./types";

/** Empty slots from today through `days` days ahead (inclusive of today). */
export function openPickupSlotsWithinDays(data: AppData, days: number): ScheduleSlot[] {
  const today = format(new Date(), "yyyy-MM-dd");
  const last = format(addDays(new Date(), days), "yyyy-MM-dd");
  return data.slots
    .filter((s) => !s.driverId && s.date >= today && s.date <= last)
    .sort((a, b) => (a.date === b.date ? a.label.localeCompare(b.label) : a.date.localeCompare(b.date)));
}
