import { NextRequest, NextResponse } from "next/server";
import { applyDefaultDriversToEmptySlots } from "@/lib/apply-defaults";
import { ensureDb, rebuildSlotsForWeek } from "@/lib/db";
import { formatISODate, mondayOfWeekContaining, parseISO } from "@/lib/week-utils";

/** Read-only week preview for driver viewing: does not write to disk. */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { weekStart } = body as { weekStart: string };
  if (!weekStart) {
    return NextResponse.json({ error: "weekStart (YYYY-MM-DD) required" }, { status: 400 });
  }
  const monday = formatISODate(mondayOfWeekContaining(parseISO(weekStart)));
  let data = await ensureDb();
  data = rebuildSlotsForWeek(data, monday);
  const { data: next, errors } = applyDefaultDriversToEmptySlots(data);
  return NextResponse.json({ data: next, errors });
}
