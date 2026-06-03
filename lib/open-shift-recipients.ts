import { isPersonEffectiveOnDate, activePeople } from "./active-people";
import { canAssignDriver } from "./suggestions";
import { isDriverLike } from "./roles";
import type { AppData, Person, ScheduleSlot } from "./types";

/**
 * Active drivers who could take this open slot (including those already on
 * non-overlapping routes that day). Approval emails use the same roster record;
 * this list controls who gets the initial "open shift posted" blast.
 */
export function peopleEligibleForOpenShiftNotify(
  data: AppData,
  slot: ScheduleSlot
): Person[] {
  return activePeople(data)
    .filter((p) => isDriverLike(p.role))
    .filter((p) => isPersonEffectiveOnDate(p, slot.date))
    .filter((p) => canAssignDriver(data, slot.id, p.id).ok)
    .sort((a, b) => a.name.localeCompare(b.name));
}
