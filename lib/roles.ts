import type { Person, PersonRole } from "./types";

export const ROLE_OPTIONS: { value: PersonRole; label: string }[] = [
  { value: "owner", label: "Owner" },
  { value: "ops_manager", label: "Ops Manager" },
  { value: "dispatch", label: "Dispatch" },
  { value: "full_time_driver", label: "Full time driver" },
  { value: "part_time_driver", label: "Part time driver" },
  { value: "on_call_driver", label: "On-call driver" },
];

export function isDispatcherLike(role: PersonRole): boolean {
  return role === "dispatch" || role === "ops_manager" || role === "owner";
}

export function isDriverLike(role: PersonRole): boolean {
  return (
    role === "full_time_driver" ||
    role === "part_time_driver" ||
    role === "on_call_driver"
  );
}

export function canStaffOfficeSlot(person: Person): boolean {
  return isDispatcherLike(person.role);
}

export function roleNeedsProfileToken(role: PersonRole): boolean {
  return isDriverLike(role);
}

export function roleLabel(role: PersonRole): string {
  const o = ROLE_OPTIONS.find((x) => x.value === role);
  return o?.label ?? role;
}

/** Migrate legacy role strings from older JSON */
export function migratePersonRole(role: string): PersonRole {
  switch (role) {
    case "dispatcher":
      return "dispatch";
    case "driver":
      return "full_time_driver";
    case "oncall":
      return "on_call_driver";
    default:
      return role as PersonRole;
  }
}
