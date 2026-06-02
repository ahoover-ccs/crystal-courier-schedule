import { subMonths, format } from "date-fns";
import { defaultDriverForTemplateDate } from "./availability-helpers";
import { slotsForDate } from "./schedule-for-date";
import type { AppData } from "./types";

/** Distinct calendar days in the trailing N months the person was out (approved time off or gap for them). */
export function trailingMonthsAbsenceDayCount(
  data: AppData,
  personId: string,
  months: number,
  throughDateISO: string
): number {
  const through = new Date(throughDateISO + "T12:00:00");
  const from = subMonths(through, months);
  const fromISO = format(from, "yyyy-MM-dd");
  const dates = new Set<string>();

  for (const r of data.timeOffRequests) {
    if (r.driverId !== personId || r.status !== "approved") continue;
    if (r.date >= fromISO && r.date <= throughDateISO) dates.add(r.date);
  }

  if (data.slotOverrides) {
    for (const [slotId, o] of Object.entries(data.slotOverrides)) {
      if (o.gapForDriverId !== personId) continue;
      const sep = slotId.indexOf("__");
      const date = sep === -1 ? slotId : slotId.slice(0, sep);
      if (date >= fromISO && date <= throughDateISO) dates.add(date);
    }
  }

  for (const s of data.slots) {
    if (s.gapForDriverId !== personId) continue;
    if (s.date >= fromISO && s.date <= throughDateISO) dates.add(s.date);
  }

  return dates.size;
}

/**
 * How many other drivers are "out" on a date: assigned off their default route, plus unfilled shifts.
 */
export function othersOutOnDate(
  data: AppData,
  date: string,
  excludePersonId: string
): number {
  const slots = slotsForDate(data, date);
  let count = 0;
  const nonDefaultDrivers = new Set<string>();

  for (const slot of slots) {
    const tid = slot.id.slice(slot.id.indexOf("__") + 2);
    const template = data.settings.slotTemplates.find((t) => t.id === tid);
    const def = template ? defaultDriverForTemplateDate(date, template) : null;

    if (!slot.driverId) {
      count += 1;
      continue;
    }
    if (slot.driverId === excludePersonId) continue;
    if (slot.driverId !== def) {
      nonDefaultDrivers.add(slot.driverId);
    }
  }

  return count + nonDefaultDrivers.size;
}

export function maxOthersOutInRange(
  data: AppData,
  dates: string[],
  excludePersonId: string
): number {
  let max = 0;
  for (const d of dates) {
    max = Math.max(max, othersOutOnDate(data, d, excludePersonId));
  }
  return max;
}
