import { NextRequest, NextResponse } from "next/server";
import { appendActivity } from "@/lib/activity-log";
import { ensureDb, writeDb } from "@/lib/db";
import { sendTransactionalEmail } from "@/lib/email-sender";
import { peopleEligibleForOpenShiftNotify } from "@/lib/open-shift-recipients";
import { driverPortalUrl } from "@/lib/public-urls";
import { sendTransactionalSms } from "@/lib/sms-sender";
import type { OpenShift, Person, ScheduleSlot } from "@/lib/types";

async function notifyEligibleDrivers(params: {
  recipients: Person[];
  slot: ScheduleSlot;
  portalUrl: string;
  reminder: boolean;
  log: OpenShift["notificationLog"];
}): Promise<void> {
  const { slot, reminder } = params;
  const emailSubject = reminder
    ? `[Crystal Courier] Reminder: open shift still available — ${slot.label} (${slot.date})`
    : `[Crystal Courier] Open shift: ${slot.label} (${slot.date})`;
  const intro = reminder
    ? "This open shift is still available and we still need help covering it. Would you please consider grabbing it?"
    : "There’s an open route on Crystal Courier’s schedule that we need help covering. Would you please consider grabbing this open shift?";

  for (const p of params.recipients) {
    const name = p.name;
    const email = p.email?.trim();
    const phone = p.phone?.trim();
    const at = new Date().toISOString();

    if (email) {
      const text = `Hi ${name},

${intro}

• ${slot.label}
• ${slot.date}

View schedule and claim open shifts: ${params.portalUrl}

— Crystal Courier`;
      try {
        const result = await sendTransactionalEmail({
          to: email,
          subject: emailSubject,
          text,
        });
        if (result.ok && result.channel === "resend") {
          params.log.push({
            at,
            channel: "email",
            message: `Email sent to ${name} <${email}>`,
          });
        } else if (result.ok && result.channel === "log") {
          params.log.push({
            at,
            channel: "email",
            message: `Email logged for ${name} <${email}> (set RESEND_API_KEY to send)`,
          });
        } else {
          params.log.push({
            at,
            channel: "email",
            message: `Email failed for ${name} <${email}>${result.error ? `: ${result.error}` : ""}`,
          });
        }
      } catch (e) {
        console.error("[open-shift email]", e);
        params.log.push({ at, channel: "email", message: `Email failed for ${name} <${email}>` });
      }
    }

    if (phone) {
      const smsBody = reminder
        ? `Crystal Courier reminder: ${slot.label} on ${slot.date} is still open. ${params.portalUrl}`
        : `Crystal Courier: open shift ${slot.label} on ${slot.date}. ${params.portalUrl}`;
      try {
        const result = await sendTransactionalSms({ to: phone, body: smsBody });
        params.log.push({
          at,
          channel: "sms",
          message:
            result.channel === "twilio"
              ? `SMS sent to ${name} (${phone})`
              : `SMS logged for ${name} (${phone}) — set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER to send`,
        });
      } catch (e) {
        console.error("[open-shift sms]", e);
        params.log.push({ at, channel: "sms", message: `SMS failed for ${name} (${phone})` });
      }
    }

    if (!email && !phone) {
      params.log.push({
        at,
        channel: "in-app",
        message: `Skipped ${name} — no email or phone on file`,
      });
    }
  }
}

/** Manager: notify team not on the schedule that day about an open shift. Repeat sends are reminders. */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { slotId } = body as { slotId: string };
  if (!slotId) {
    return NextResponse.json({ error: "slotId required" }, { status: 400 });
  }
  const data = await ensureDb();
  const slot = data.slots.find((s) => s.id === slotId);
  if (!slot) {
    return NextResponse.json({ error: "Slot not found" }, { status: 404 });
  }
  if (slot.driverId) {
    return NextResponse.json({ error: "This shift is no longer open" }, { status: 409 });
  }

  const recipients = peopleEligibleForOpenShiftNotify(data, slot);
  const portalUrl = driverPortalUrl(new URL(req.url).origin);
  const stamp = new Date().toISOString();
  const existing = data.openShifts.find((o) => o.slotId === slotId && o.status === "open");

  if (existing) {
    const prior = existing.notificationLog.length;
    existing.notificationLog.push({
      at: stamp,
      channel: "in-app",
      message: `Reminder sent: ${slot.label} on ${slot.date} — notified ${recipients.length} active driver(s) who can cover this shift (email and/or SMS per contact info).`,
    });
    await notifyEligibleDrivers({
      recipients,
      slot,
      portalUrl,
      reminder: true,
      log: existing.notificationLog,
    });
    const sendLog = existing.notificationLog.slice(prior);
    existing.teamNotifiedAt = [...(existing.teamNotifiedAt ?? (existing.invitedAt ? [existing.invitedAt] : [])), stamp];
    appendActivity(data, {
      category: "open_shift",
      summary: `Reminder sent for open shift: ${slot.label} on ${slot.date} (${recipients.length} eligible)`,
      detail: sendLog.map((n) => `[${n.channel}] ${n.message}`).join("\n"),
    });
    await writeDb(data);
    return NextResponse.json({ data, openShift: existing, sendLog });
  }

  const log: OpenShift["notificationLog"] = [
    {
      at: stamp,
      channel: "in-app",
      message: `Open shift posted: ${slot.label} on ${slot.date} — notified ${recipients.length} active driver(s) who can cover this shift (email and/or SMS per contact info).`,
    },
  ];
  await notifyEligibleDrivers({
    recipients,
    slot,
    portalUrl,
    reminder: false,
    log,
  });

  const row: OpenShift = {
    id: `os-${Date.now()}`,
    slotId: slot.id,
    date: slot.date,
    routeType: slot.routeType,
    label: slot.label,
    status: "open",
    claimedById: null,
    claimedByName: null,
    pendingClaimDriverId: null,
    pendingClaimDriverName: null,
    pendingClaimAt: null,
    invitedAt: stamp,
    teamNotifiedAt: [stamp],
    notificationLog: log,
  };
  data.openShifts.push(row);
  appendActivity(data, {
    category: "open_shift",
    summary: `Posted open shift: ${slot.label} on ${slot.date} (${recipients.length} eligible)`,
    detail: log.map((n) => `[${n.channel}] ${n.message}`).join("\n"),
  });
  await writeDb(data);
  return NextResponse.json({ data, openShift: row, sendLog: log });
}
