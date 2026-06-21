import {
  addDays,
  format,
  parseISO,
  startOfWeek,
  eachDayOfInterval,
} from "date-fns";

export const WEEK_OPTIONS = { weekStartsOn: 0 as const }; // Sunday

/** First day (Sunday) of the calendar week containing `date`. */
export function weekStartContaining(date: Date): Date {
  return startOfWeek(date, WEEK_OPTIONS);
}

/** @deprecated Use `weekStartContaining` — weeks now start on Sunday. */
export function mondayOfWeekContaining(date: Date): Date {
  return weekStartContaining(date);
}

export function formatISODate(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

/**
 * Mon–Fri ISO dates for the work week. `weekStartISO` is the Sunday that starts the week
 * (legacy data may still store a Monday; that case is handled too).
 */
export function weekWorkdaysFromWeekStart(weekStartISO: string): string[] {
  const anchor = parseISO(weekStartISO);
  const monday = anchor.getDay() === 1 ? anchor : addDays(anchor, 1);
  const friday = addDays(monday, 4);
  return eachDayOfInterval({ start: monday, end: friday }).map(formatISODate);
}

/** @deprecated Use `weekWorkdaysFromWeekStart`. */
export function weekDaysFromMonday(weekStartISO: string): string[] {
  return weekWorkdaysFromWeekStart(weekStartISO);
}

/** Normalize persisted week anchor to Sunday (migrates legacy Monday values). */
export function normalizeStoredWeekStart(iso: string): string {
  if (!iso) return formatISODate(weekStartContaining(new Date()));
  const d = parseISO(iso);
  if (Number.isNaN(d.getTime())) return formatISODate(weekStartContaining(new Date()));
  if (d.getDay() === 1) return formatISODate(addDays(d, -1));
  return formatISODate(startOfWeek(d, WEEK_OPTIONS));
}

export function isWeekdayISO(iso: string): boolean {
  const d = parseISO(iso);
  const dow = d.getDay();
  return dow >= 1 && dow <= 5;
}

export { parseISO };
