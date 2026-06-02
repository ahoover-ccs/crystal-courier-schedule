import type { AppData, Person } from "./types";

/** Roster members still active (not terminated). Includes future hires being configured in Settings. */
export function isActivePerson(p: Person): boolean {
  return !p.terminatedAt;
}

/** True when this person may appear on the schedule for `date` (hire/termination window). */
export function isPersonEffectiveOnDate(person: Person, date: string): boolean {
  if (person.terminatedAt && date >= person.terminatedAt) return false;
  if (person.hiredAt && date < person.hiredAt) return false;
  return true;
}

export function activePeople(data: AppData): Person[] {
  return data.people.filter(isActivePerson);
}

export function personById(data: AppData, id: string): Person | undefined {
  return data.people.find((p) => p.id === id);
}
