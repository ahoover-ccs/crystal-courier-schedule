import { NextRequest, NextResponse } from "next/server";
import { appendActivity } from "@/lib/activity-log";
import { ensureDb, rebuildSlotsForWeek, writeDb } from "@/lib/db";
import { isSpecialRouteType } from "@/lib/special-routes";
import { formatISODate, isWeekdayISO, parseISO, weekStartContaining } from "@/lib/week-utils";
import type { RouteType } from "@/lib/types";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { date, routeType, name } = body as {
    date?: string;
    routeType?: string;
    name?: string;
  };
  const trimmedName = name?.trim() ?? "";
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "date (YYYY-MM-DD) required" }, { status: 400 });
  }
  if (!isWeekdayISO(date)) {
    return NextResponse.json(
      { error: "Special routes can only be added on Monday–Friday." },
      { status: 400 }
    );
  }
  if (!routeType || !isSpecialRouteType(routeType)) {
    return NextResponse.json({ error: "Time must be Lab, AM, PM, or All Day." }, { status: 400 });
  }
  if (!trimmedName) {
    return NextResponse.json({ error: "Name of route required" }, { status: 400 });
  }

  let data = await ensureDb();
  const row = {
    id: `spec-${Date.now()}`,
    date,
    routeType: routeType as RouteType,
    name: trimmedName,
    createdAt: new Date().toISOString(),
  };
  data.specialRoutes = [...(data.specialRoutes ?? []), row];
  appendActivity(data, {
    category: "schedule",
    summary: `Special route added: ${trimmedName} (${routeType}) on ${date}`,
  });
  const weekStart = formatISODate(weekStartContaining(parseISO(date)));
  data = rebuildSlotsForWeek(data, weekStart);
  await writeDb(data);
  return NextResponse.json({ data, specialRoute: row });
}
