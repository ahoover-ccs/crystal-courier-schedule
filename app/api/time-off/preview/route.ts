import { NextRequest, NextResponse } from "next/server";
import { inclusiveDateRangeISO } from "@/lib/date-range";
import { ensureDb } from "@/lib/db";
import { distinctApprovedTimeOffDaysInYear, coveredAbsenceDaysInYear } from "@/lib/absence-stats";
import { estimateTimeOffApproval } from "@/lib/time-off-likelihood";
import type { RouteType } from "@/lib/types";

const MAX_RANGE_DAYS = 60;

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { driverId, date, endDate, routeTypes } = body as {
    driverId: string;
    date: string;
    endDate?: string;
    routeTypes: RouteType[];
  };
  if (!driverId || !date || !routeTypes?.length) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const dates =
    endDate && endDate.trim() && endDate >= date
      ? inclusiveDateRangeISO(date, endDate)
      : [date];
  if (dates.length > MAX_RANGE_DAYS) {
    return NextResponse.json({ error: "Range too long" }, { status: 400 });
  }

  const data = await ensureDb();
  const person = data.people.find((p) => p.id === driverId);
  if (!person) {
    return NextResponse.json({ error: "Unknown person" }, { status: 400 });
  }

  const year = parseInt(date.slice(0, 4), 10);
  let minPercent = 100;
  let worstMessage = "";
  for (const d of dates) {
    const est = estimateTimeOffApproval(data, driverId, d, routeTypes);
    if (est.percent < minPercent) {
      minPercent = est.percent;
      worstMessage = est.message;
    }
  }
  const estimate = {
    percent: minPercent,
    warnLow: minPercent < 50,
    message: worstMessage || "Estimate based on the hardest day in this range.",
  };

  const requestedDays = distinctApprovedTimeOffDaysInYear(data, driverId, year);
  const coveredDays = coveredAbsenceDaysInYear(data, driverId, year);
  const willBeRequested = new Set(
    data.timeOffRequests
      .filter(
        (r) =>
          r.driverId === driverId &&
          r.date.startsWith(String(year)) &&
          r.status !== "rejected"
      )
      .map((r) => r.date)
  );
  for (const d of dates) {
    if (d.startsWith(String(year))) willBeRequested.add(d);
  }
  const projectedRequested = willBeRequested.size;

  return NextResponse.json({
    estimate,
    stats: {
      requestedDaysThisYear: requestedDays,
      projectedRequestedDaysThisYear: projectedRequested,
      coveredAbsenceDaysThisYear: coveredDays,
      warnManyDaysOff: projectedRequested > 12,
    },
    daysInRange: dates.length,
  });
}
