import type { AppData, Person } from "./types";

/** Everyone not assigned to any slot on this calendar day (any role). */
export function peopleNotScheduledOnDate(data: AppData, date: string): Person[] {
  const assignedIds = new Set(
    data.slots.filter((s) => s.date === date && s.driverId).map((s) => s.driverId as string)
  );
  return data.people.filter((p) => !assignedIds.has(p.id));
}
