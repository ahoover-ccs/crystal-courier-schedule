import type { AppData, Person } from "./types";

/** Roster members still active (not terminated). */
export function isActivePerson(p: Person): boolean {
  return !p.terminatedAt;
}

export function activePeople(data: AppData): Person[] {
  return data.people.filter(isActivePerson);
}

export function personById(data: AppData, id: string): Person | undefined {
  return data.people.find((p) => p.id === id);
}
