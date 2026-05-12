import {
  addDays,
  format,
  parseISO,
  startOfWeek,
  eachDayOfInterval,
} from "date-fns";

export const WEEK_OPTIONS = { weekStartsOn: 1 as const }; // Monday

export function mondayOfWeekContaining(date: Date): Date {
  return startOfWeek(date, WEEK_OPTIONS);
}

export function formatISODate(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

export function weekDaysFromMonday(mondayISO: string): string[] {
  const mon = parseISO(mondayISO);
  const fri = addDays(mon, 4);
  return eachDayOfInterval({ start: mon, end: fri }).map(formatISODate);
}

export function isWeekdayISO(iso: string): boolean {
  const d = parseISO(iso);
  const dow = d.getDay();
  return dow >= 1 && dow <= 5;
}

export { parseISO };
