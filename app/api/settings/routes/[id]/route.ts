import { NextRequest, NextResponse } from "next/server";
import { applyDefaultDriversToEmptySlots } from "@/lib/apply-defaults";
import { ensureDb, rebuildSlotsForWeek, writeDb } from "@/lib/db";
import { syncSlotTemplatesWithCatalog } from "@/lib/sync-catalog-templates";
import { sanitizeTemplateDefaults } from "@/lib/terminate-person";
import { formatISODate } from "@/lib/week-utils";

type Ctx = { params: Promise<{ id: string }> };

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  if (!id) {
    return NextResponse.json({ error: "Route id required" }, { status: 400 });
  }

  let data = await ensureDb();
  const def = data.settings.routeDefinitions.find((d) => d.id === id);
  if (!def) {
    return NextResponse.json({ error: "Route not found in catalog" }, { status: 404 });
  }
  if (def.retiredAt) {
    return NextResponse.json({ error: "Route is already removed" }, { status: 400 });
  }

  const retiredToday = formatISODate(new Date());
  data.settings.routeDefinitions = data.settings.routeDefinitions.map((d) =>
    d.id === id ? { ...d, retiredAt: retiredToday, isOfficeRoute: d.routeType === "office" } : d
  );

  data.settings.slotTemplates = syncSlotTemplatesWithCatalog(
    data.settings.routeDefinitions,
    data.settings.slotTemplates
  );

  data = rebuildSlotsForWeek(data, data.settings.defaultWeekStart);
  const { data: filled } = applyDefaultDriversToEmptySlots(data);
  sanitizeTemplateDefaults(filled);
  await writeDb(filled);
  return NextResponse.json(filled);
}
