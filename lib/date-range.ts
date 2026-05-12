import { eachDayOfInterval, format, parseISO } from "date-fns";

/** Inclusive calendar dates from start through end (ISO yyyy-MM-dd). Empty if end is before start. */
export function inclusiveDateRangeISO(startISO: string, endISO: string): string[] {
  const start = parseISO(startISO);
  const end = parseISO(endISO);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return [];
  if (end < start) return [];
  return eachDayOfInterval({ start, end }).map((d) => format(d, "yyyy-MM-dd"));
}
