import { eachDayOfInterval, format, parseISO } from "date-fns";
import { isWeekdayISO } from "./week-utils";

/** Inclusive calendar dates from start through end (ISO yyyy-MM-dd). Empty if end is before start. */
export function inclusiveDateRangeISO(startISO: string, endISO: string): string[] {
  const start = parseISO(startISO);
  const end = parseISO(endISO);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return [];
  if (end < start) return [];
  return eachDayOfInterval({ start, end }).map((d) => format(d, "yyyy-MM-dd"));
}

/** Mon–Fri dates in an inclusive range (weekends are skipped). */
export function timeOffRequestDates(startISO: string, endISO?: string): string[] {
  const raw =
    endISO && endISO.trim() && endISO >= startISO
      ? inclusiveDateRangeISO(startISO, endISO)
      : [startISO];
  return raw.filter(isWeekdayISO);
}
