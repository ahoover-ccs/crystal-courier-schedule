import { NextResponse } from "next/server";
import { ensureDb, writeDb } from "@/lib/db";
import { BUSINESS_TIMEZONE, sendNonDefaultShiftReminders } from "@/lib/non-default-reminders";
import { driverPortalUrl } from "@/lib/public-urls";
import type { AppData } from "@/lib/types";

export const dynamic = "force-dynamic";

function publicBaseUrl(req: Request): string {
  return driverPortalUrl(new URL(req.url).origin);
}

/**
 * Call on a schedule (hourly is enough) with optional `Authorization: Bearer CRON_SECRET`.
 * From 8:00 America/Denver the day before, sends one email per driver listing every
 * non-default route for the next day. A run that does not actually deliver is not
 * recorded, so the next run tries again.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const h = req.headers.get("authorization");
    if (h !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const data = await ensureDb();
  const run = await sendNonDefaultShiftReminders({
    data,
    portalUrl: publicBaseUrl(req),
  });

  if (run.newRows.length) {
    const next = {
      ...data,
      nonDefaultShiftReminders: [...(data.nonDefaultShiftReminders ?? []), ...run.newRows],
      activityLog: data.activityLog,
    } as AppData;
    await writeDb(next);
  }

  const delivered = run.failed === 0;
  return NextResponse.json(
    {
      ok: delivered,
      timezone: BUSINESS_TIMEZONE,
      today: run.today,
      tomorrow: run.tomorrow,
      localHour: run.localHour,
      sendWindowOpen: run.sendWindowOpen,
      sent: run.sent,
      failed: run.failed,
      details: run.details,
      pending: run.pending,
    },
    { status: delivered ? 200 : 500 }
  );
}
