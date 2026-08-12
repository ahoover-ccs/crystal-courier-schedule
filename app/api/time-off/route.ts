import { NextRequest, NextResponse } from "next/server";
import { appendActivity } from "@/lib/activity-log";
import { inclusiveDateRangeISO } from "@/lib/date-range";
import { ensureDb, writeDb } from "@/lib/db";
import { notifyTimeOffRequest } from "@/lib/send-time-off-email";
import {
  isDateWithinTimeOffWindow,
  maxTimeOffRequestDateISO,
} from "@/lib/time-off-dates";
import type { RouteType, TimeOffRequest } from "@/lib/types";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { driverId, date, endDate, routeTypes, note } = body as {
    driverId: string;
    date: string;
    endDate?: string;
    routeTypes: RouteType[];
    note?: string;
  };
  if (!driverId || !date || !routeTypes?.length) {
    return NextResponse.json(
      { error: "driverId, date, and routeTypes required" },
      { status: 400 }
    );
  }
  const dates =
    endDate && endDate.trim() && endDate >= date
      ? inclusiveDateRangeISO(date, endDate)
      : [date];
  if (dates.length === 0) {
    return NextResponse.json({ error: "Invalid date range" }, { status: 400 });
  }
  const maxDate = maxTimeOffRequestDateISO();
  const outOfWindow = dates.find((d) => !isDateWithinTimeOffWindow(d));
  if (outOfWindow) {
    return NextResponse.json(
      { error: `Dates must be on or before ${maxDate} (up to 18 months ahead)` },
      { status: 400 }
    );
  }

  const data = await ensureDb();
  const person = data.people.find((p) => p.id === driverId && !p.terminatedAt);
  if (!person) {
    return NextResponse.json({ error: "Driver not found" }, { status: 404 });
  }

  const baseId = Date.now();
  for (let di = 0; di < dates.length; di++) {
    const d = dates[di];
    const id = `tof-${baseId}-${di}`;
    const reqRow: TimeOffRequest = {
      id,
      driverId,
      driverName: person.name,
      date: d,
      routeTypes,
      note,
      status: "pending",
      createdAt: new Date().toISOString(),
    };
    data.timeOffRequests.push(reqRow);
  }

  const rangeLabel =
    dates.length === 1
      ? dates[0]
      : `${dates[0]} through ${dates[dates.length - 1]} (${dates.length} days)`;
  appendActivity(data, {
    category: "time_off",
    summary: `Time off requested: ${person.name} — ${rangeLabel}`,
    detail: routeTypes.join(", ") + (note?.trim() ? `\nNote: ${note.trim()}` : ""),
  });

  await writeDb(data);

  notifyTimeOffRequest({
    driverName: person.name,
    dates,
    routeTypes,
    note,
  }).catch((e) => console.error("[time-off email]", e));

  const fresh = await ensureDb();
  return NextResponse.json({ data: fresh, datesRequested: dates, pendingCount: dates.length });
}
