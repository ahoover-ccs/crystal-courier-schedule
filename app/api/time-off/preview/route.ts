import { NextRequest, NextResponse } from "next/server";
import { timeOffRequestDates } from "@/lib/date-range";
import { ensureDb } from "@/lib/db";
import {
  maxOthersOutInRange,
  trailingMonthsAbsenceDayCount,
} from "@/lib/time-off-preview-stats";
import {
  isDateWithinTimeOffWindow,
  maxTimeOffRequestDateISO,
} from "@/lib/time-off-dates";
import type { RouteType } from "@/lib/types";

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
  const dates = timeOffRequestDates(date, endDate);
  if (dates.length === 0) {
    return NextResponse.json(
      { error: "Choose a range that includes at least one weekday (Monday–Friday)" },
      { status: 400 }
    );
  }
  const maxDate = maxTimeOffRequestDateISO();
  const outOfWindow = dates.find((d) => !isDateWithinTimeOffWindow(d));
  if (outOfWindow) {
    return NextResponse.json(
      { error: `Dates must be on or before ${maxDate}` },
      { status: 400 }
    );
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
