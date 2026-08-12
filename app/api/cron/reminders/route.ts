import { NextResponse } from "next/server";
import { parseISO } from "date-fns";
import { appendActivity } from "@/lib/activity-log";
import { slotTemplateForSlot } from "@/lib/availability-helpers";
import { effectiveDefaultDriverForDate } from "@/lib/person-roster-dates";
import { ensureDb, writeDb } from "@/lib/db";
import { sendTransactionalEmail } from "@/lib/email-sender";
import { driverPortalUrl } from "@/lib/public-urls";
import { sendTransactionalSms } from "@/lib/sms-sender";
import type { AppData, NonDefaultShiftReminder, ScheduleSlot } from "@/lib/types";
import { routeWindow } from "@/lib/route-windows";
import { isSpecialRouteSlotId } from "@/lib/special-routes";

function reminderKey(slot: ScheduleSlot, driverId: string): string {
  return `nd-${slot.id}-${driverId}`;
}

function publicBaseUrl(req: Request): string {
  return driverPortalUrl(new URL(req.url).origin);
}

/**
 * Call on a schedule (e.g. hourly) with optional `Authorization: Bearer CRON_SECRET`.
 * Sends one email + SMS per slot when the assignee is not the default driver and the shift starts in ~24h.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const h = req.headers.get("authorization");
    if (h !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  let data = await ensureDb();
  const now = new Date();
  const portalUrl = publicBaseUrl(req);
  const sent = new Set((data.nonDefaultShiftReminders ?? []).map((r) => r.key));
  const newRows: NonDefaultShiftReminder[] = [];
  const log: string[] = [];

  for (const s of data.slots) {
    if (!s.driverId) continue;
    const template = slotTemplateForSlot(data, s);
    const isSpecial = isSpecialRouteSlotId(s.id);
    if (!template && !isSpecial) continue;
    if (template) {
      const def = effectiveDefaultDriverForDate(data, s.date, template);
      if (def == null || def === s.driverId) continue;
    }

    const key = reminderKey(s, s.driverId);
    if (sent.has(key) || newRows.some((r) => r.key === key)) continue;

    const day = parseISO(`${s.date}T12:00:00`);
    const w = routeWindow(s.routeType);
    const shiftStart = new Date(day);
    shiftStart.setHours(Math.floor(w.start / 60), w.start % 60, 0, 0);
    const diffMs = shiftStart.getTime() - now.getTime();
    const hours = diffMs / (1000 * 60 * 60);
    // ~24h window with slack so hourly (or near-hourly) cron does not miss the slot
    if (hours < 22 || hours > 26) continue;

    const person = data.people.find((p) => p.id === s.driverId);
    if (!person) continue;

    const stamp = new Date().toISOString();
    const subject = `[Crystal Courier] Reminder: ${s.label} in ~24 hours (${s.date})`;
    const text = `Hi ${person.name},

You’re scheduled (covering a route that isn’t the usual default) in about 24 hours for:

• ${s.label}
• ${s.date}

Schedule: ${portalUrl}

— Crystal Courier`;
    const sms = `Crystal Courier: you’re on ${s.label} ${s.date}. ${portalUrl}`;

    let contacted = false;
    if (person.email?.trim()) {
      await sendTransactionalEmail({
        to: person.email.trim(),
        subject,
        text,
      }).catch((e) => console.error("[non-default reminder email]", e));
      contacted = true;
    }
    if (person.phone?.trim()) {
      await sendTransactionalSms({ to: person.phone.trim(), body: sms }).catch((e) =>
        console.error("[non-default reminder sms]", e)
      );
      contacted = true;
    }

    newRows.push({ key, sentAt: stamp });
    sent.add(key);
    log.push(`${person.name}: ${s.label} on ${s.date}`);
    appendActivity(data, {
      category: "reminder",
      summary: `Non-default shift reminder: ${person.name} — ${s.label} on ${s.date}`,
      detail: contacted
        ? "Email and/or SMS attempted"
        : "No email or phone on file — reminder recorded only",
      at: stamp,
    });
  }

  if (newRows.length) {
    data = {
      ...data,
      nonDefaultShiftReminders: [...(data.nonDefaultShiftReminders ?? []), ...newRows],
      activityLog: data.activityLog,
    } as AppData;
    await writeDb(data);
  }

  return NextResponse.json({ ok: true, sent: newRows.length, details: log });
}
