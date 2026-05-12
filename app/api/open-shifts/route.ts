import { NextRequest, NextResponse } from "next/server";
import { ensureDb, writeDb } from "@/lib/db";
import { sendTransactionalEmail } from "@/lib/email-sender";
import { peopleNotScheduledOnDate } from "@/lib/open-shift-recipients";
import { sendTransactionalSms } from "@/lib/sms-sender";
import type { OpenShift } from "@/lib/types";

function publicAppUrl(): string {
  return (process.env.APP_PUBLIC_URL ?? "").replace(/\/$/, "");
}

/** Manager: notify team not on the schedule that day about an open shift */
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
  const existing = data.openShifts.find((o) => o.slotId === slotId && o.status === "open");
  if (existing) {
    return NextResponse.json({ error: "Open shift already exists for this slot" }, { status: 409 });
  }

  const recipients = peopleNotScheduledOnDate(data, slot.date);
  const baseUrl = publicAppUrl() || new URL(req.url).origin;
  const openShiftsUrl = `${baseUrl}/open-shifts`;

  const stamp = new Date().toISOString();
  const log: OpenShift["notificationLog"] = [
    {
      at: stamp,
      channel: "in-app",
      message: `Open shift posted: ${slot.label} on ${slot.date} — notified ${recipients.length} team member(s) with no assignment that day (email and/or SMS per contact info).`,
    },
  ];

  const emailSubject = `[Crystal Courier] Open shift: ${slot.label} (${slot.date})`;

  for (const p of recipients) {
    const name = p.name;
    const email = p.email?.trim();
    const phone = p.phone?.trim();
    const at = new Date().toISOString();

    if (email) {
      const text = `Hi ${name},

There’s an open route on the schedule you may be able to cover:

• ${slot.label}
• ${slot.date}

First to claim in the app gets it: ${openShiftsUrl}

— Crystal Courier`;
      try {
        const result = await sendTransactionalEmail({
          to: email,
          subject: emailSubject,
          text,
        });
        log.push({
          at,
          channel: "email",
          message:
            result.channel === "resend"
              ? `Email sent to ${name} <${email}>`
              : `Email logged for ${name} <${email}> (set RESEND_API_KEY to send)`,
        });
      } catch (e) {
        console.error("[open-shift email]", e);
        log.push({ at, channel: "email", message: `Email failed for ${name} <${email}>` });
      }
    }

    if (phone) {
      const smsBody = `Crystal Courier: open shift ${slot.label} on ${slot.date}. Claim in app: ${openShiftsUrl}`;
      try {
        const result = await sendTransactionalSms({ to: phone, body: smsBody });
        log.push({
          at,
          channel: "sms",
          message:
            result.channel === "twilio"
              ? `SMS sent to ${name} (${phone})`
              : `SMS logged for ${name} (${phone}) — set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER to send`,
        });
      } catch (e) {
        console.error("[open-shift sms]", e);
        log.push({ at, channel: "sms", message: `SMS failed for ${name} (${phone})` });
      }
    }

    if (!email && !phone) {
      log.push({
        at,
        channel: "in-app",
        message: `Skipped ${name} — no email or phone on file`,
      });
    }
  }

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
    notificationLog: log,
  };
  data.openShifts.push(row);
  await writeDb(data);
  return NextResponse.json({ data, openShift: row });
}
