export const ABSENCE_PLANNED = "Planned/Excused";
export const ABSENCE_UNPLANNED = "Unplanned/Unexcused";

export function plannedTimeOffGapReason(driverName: string): string {
  return `${ABSENCE_PLANNED} — Time off — ${driverName}`;
}

export function unplannedGapReason(driverName: string): string {
  return `${ABSENCE_UNPLANNED} — ${driverName}`;
}

export function isPlannedAbsenceGapReason(reason: string | undefined): boolean {
  return Boolean(reason?.startsWith(ABSENCE_PLANNED) || reason?.includes("Time off"));
}
