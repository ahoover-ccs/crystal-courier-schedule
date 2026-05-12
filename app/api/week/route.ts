import { NextRequest, NextResponse } from "next/server";
import { applyDefaultDriversToEmptySlots } from "@/lib/apply-defaults";
import { ensureDb, writeDb, rebuildSlotsForWeek } from "@/lib/db";
import { formatISODate, mondayOfWeekContaining, parseISO } from "@/lib/week-utils";

/**
 * Same pipeline as POST /api/sync-defaults, after rebuilding the Mon–Fri grid for the chosen week.
 * (Rebuild merges `slotOverrides` from disk; then empty non-gap cells get Settings defaults.)
 */
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
  await writeDb(next);
  return NextResponse.json({ data: next, errors });
}
