import { addMonths, format } from "date-fns";

export const MAX_TIME_OFF_FUTURE_MONTHS = 18;

/** Latest calendar date (ISO) a time-off request may include. */
export function maxTimeOffRequestDateISO(): string {
  return format(addMonths(new Date(), MAX_TIME_OFF_FUTURE_MONTHS), "yyyy-MM-dd");
}

export function isDateWithinTimeOffWindow(dateISO: string): boolean {
  return dateISO <= maxTimeOffRequestDateISO();
}
