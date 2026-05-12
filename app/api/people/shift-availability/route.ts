import { NextRequest, NextResponse } from "next/server";
import { ensureDb, writeDb } from "@/lib/db";
import { normalizeWeeklyAvailability } from "@/lib/availability-helpers";
import type { WeeklyShiftAvailability } from "@/lib/types";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { updates } = body as {
    updates: { id: string; weeklyShiftAvailability: WeeklyShiftAvailability }[];
  };
  if (!updates?.length) {
    return NextResponse.json({ error: "updates required" }, { status: 400 });
  }
  const data = await ensureDb();
  for (const u of updates) {
    const idx = data.people.findIndex((p) => p.id === u.id);
    if (idx === -1) continue;
    const cur = data.people[idx];
    data.people[idx] = {
      ...cur,
      weeklyShiftAvailability: normalizeWeeklyAvailability(u.weeklyShiftAvailability),
    };
  }
  await writeDb(data);
  return NextResponse.json(data);
}
