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
 * Call on a schedule (e.g. hourly) with optional `Authorization: Bearer CRON_SECRET`.
 * Sends one email + SMS per driver the Denver morning before their non-default shift(s).
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

  return NextResponse.json({
    ok: true,
    timezone: BUSINESS_TIMEZONE,
    today: run.today,
    tomorrow: run.tomorrow,
    localHour: run.localHour,
    sendWindowOpen: run.sendWindowOpen,
    sent: run.sent,
    details: run.details,
    pending: run.pending,
  });
}
