import type { OpenShift } from "./types";

/** Crystal Courier operates in Denver. Kept local so this file stays client-safe. */
const BUSINESS_TIMEZONE = "America/Denver";

/** MM/DD/YY in Denver, where the schedule is run. */
export function formatTeamNotifiedDate(iso: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: BUSINESS_TIMEZONE,
    month: "2-digit",
    day: "2-digit",
    year: "2-digit",
  }).formatToParts(new Date(iso));
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";
  return `${get("month")}/${get("day")}/${get("year")}`;
}

/** Dates a team blast went out, earliest first. Same calendar day is listed once. */
export function teamNotifiedDates(shift: OpenShift): string[] {
  const stamps = shift.teamNotifiedAt?.length
    ? shift.teamNotifiedAt
    : shift.invitedAt
      ? [shift.invitedAt]
      : [];
  const dates: string[] = [];
  for (const stamp of stamps) {
    const label = formatTeamNotifiedDate(stamp);
    if (label && !dates.includes(label)) dates.push(label);
  }
  return dates;
}

export function teamNotifiedNote(shift: OpenShift): string | null {
  const dates = teamNotifiedDates(shift);
  if (dates.length === 0) return null;
  return `Team notified on ${dates.join(", ")}`;
}
