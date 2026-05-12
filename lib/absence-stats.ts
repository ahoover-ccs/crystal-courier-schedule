import type { AppData } from "./types";

export function distinctApprovedTimeOffDaysInYear(
  data: AppData,
  personId: string,
  year: number
): number {
  const dates = new Set<string>();
  for (const r of data.timeOffRequests) {
    if (r.status !== "approved") continue;
    if (r.driverId !== personId) continue;
    if (!r.date.startsWith(String(year))) continue;
    dates.add(r.date);
  }
  return dates.size;
}

export function coveredAbsenceDaysInYear(
  data: AppData,
  personId: string,
  year: number
): number {
  let sum = 0;
  for (const s of data.absenceStats) {
    if (s.personId === personId && s.year === year) {
      sum += s.coveredAbsenceDayCount;
    }
  }
  return sum;
}

export function incrementCoveredAbsence(
  data: AppData,
  gapForDriverId: string,
  date: string
): AppData {
  const year = parseInt(date.slice(0, 4), 10);
  let row = data.absenceStats.find(
    (a) => a.personId === gapForDriverId && a.year === year
  );
  if (!row) {
    row = {
      personId: gapForDriverId,
      year,
      requestedDayCount: 0,
      coveredAbsenceDayCount: 0,
    };
    data.absenceStats.push(row);
  }
  row.coveredAbsenceDayCount += 1;
  return data;
}
