import { NextRequest, NextResponse } from "next/server";
import { appendActivity } from "@/lib/activity-log";
import { ensureDb, rebuildSlotsForWeek, writeDb } from "@/lib/db";
import { specialRouteSlotId } from "@/lib/special-routes";

type Ctx = { params: Promise<{ id: string }> };

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }
  let data = await ensureDb();
  const row = (data.specialRoutes ?? []).find((r) => r.id === id);
  if (!row) {
    return NextResponse.json({ error: "Special route not found" }, { status: 404 });
  }

  const slotId = specialRouteSlotId(row);
  data.specialRoutes = (data.specialRoutes ?? []).filter((r) => r.id !== id);
  if (data.slotOverrides && slotId in data.slotOverrides) {
    const next = { ...data.slotOverrides };
    delete next[slotId];
    data.slotOverrides = Object.keys(next).length ? next : undefined;
  }
  data.openShifts = data.openShifts.map((o) =>
    o.slotId === slotId && o.status === "open"
      ? { ...o, status: "cancelled" as const }
      : o
  );
  appendActivity(data, {
    category: "schedule",
    summary: `Special route removed: ${row.name} on ${row.date}`,
  });
  data = rebuildSlotsForWeek(data, data.settings.defaultWeekStart);
  await writeDb(data);
  return NextResponse.json({ data });
}
