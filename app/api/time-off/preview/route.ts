import { NextRequest, NextResponse } from "next/server";
import { inclusiveDateRangeISO } from "@/lib/date-range";
import { ensureDb } from "@/lib/db";
import {
  maxOthersOutInRange,
  trailingMonthsAbsenceDayCount,
} from "@/lib/time-off-preview-stats";
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

  const othersAlreadyOut = maxOthersOutInRange(data, dates, driverId);
  const trailing12MonthsDaysOff = trailingMonthsAbsenceDayCount(data, driverId, 12, date);

  return NextResponse.json({
    othersAlreadyOut,
    trailing12MonthsDaysOff,
    daysInRange: dates.length,
  });
}
