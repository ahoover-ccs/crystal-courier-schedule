import { format, parseISO } from "date-fns";
import { appendActivity } from "@/lib/activity-log";
import { applyDefaultDriversToEmptySlots } from "@/lib/apply-defaults";
import { slotTemplateForSlot } from "@/lib/availability-helpers";
import { rebuildSlotsForWeek } from "@/lib/db";
import { sendTransactionalEmail } from "@/lib/email-sender";
import { effectiveDefaultDriverForDate } from "@/lib/person-roster-dates";
import { sendTransactionalSms } from "@/lib/sms-sender";
import { routeTypeDisplayOrder } from "@/lib/route-display-order";
import { isSpecialRouteSlotId } from "@/lib/special-routes";
import type { AppData, NonDefaultShiftReminder, Person, ScheduleSlot } from "@/lib/types";
import { formatISODate, weekStartContaining } from "@/lib/week-utils";

/** Crystal Courier operates in Denver. */
export const BUSINESS_TIMEZONE = "America/Denver";

/** First hour (0–23) in Denver when the day-before reminder may send. */
export const REMINDER_SEND_AFTER_HOUR = 8;

export function reminderKey(slot: ScheduleSlot, driverId: string): string {
  return `nd-${slot.id}-${driverId}`;
}

export function calendarDateInTimeZone(now: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function hourInTimeZone(now: Date, timeZone: string): number {
  const hour = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    hourCycle: "h23",
  })
    .formatToParts(now)
    .find((p) => p.type === "hour")?.value;
  return Number(hour);
}

export function addIsoDays(iso: string, days: number): string {
  const d = parseISO(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  return formatISODate(d);
}

export function formatShiftDate(iso: string): string {
  return format(parseISO(`${iso}T12:00:00`), "EEEE, MMMM d, yyyy");
}

export function formatShortShiftDate(iso: string): string {
  return format(parseISO(`${iso}T12:00:00`), "M/d");
}

/** Assigned specials, or catalog slots whose assignee is not that day's default driver. */
export function isNonDefaultReminderSlot(data: AppData, slot: ScheduleSlot): boolean {
  if (!slot.driverId) return false;
  if (isSpecialRouteSlotId(slot.id)) return true;
  const template = slotTemplateForSlot(data, slot);
  if (!template) return false;
  const def = effectiveDefaultDriverForDate(data, slot.date, template);
  if (def == null || def === slot.driverId) return false;
  return true;
}

export type ReminderGroup = {
  driverId: string;
  date: string;
  person: Person;
  slots: ScheduleSlot[];
};

/** In-memory week for `date` (does not persist `defaultWeekStart`). */
export function scheduleForDate(data: AppData, date: string): AppData {
  const weekStart = formatISODate(weekStartContaining(parseISO(`${date}T12:00:00`)));
  const isolated: AppData = {
    ...data,
    slotOverrides: data.slotOverrides ? { ...data.slotOverrides } : undefined,
    slots: [],
  };
  return applyDefaultDriversToEmptySlots(rebuildSlotsForWeek(isolated, weekStart)).data;
}

function sortReminderSlots(a: ScheduleSlot, b: ScheduleSlot): number {
  const typeCmp = routeTypeDisplayOrder(a.routeType) - routeTypeDisplayOrder(b.routeType);
  if (typeCmp !== 0) return typeCmp;
  return a.label.localeCompare(b.label, undefined, { sensitivity: "base" });
}

export function collectReminderGroups(
  data: AppData,
  date: string,
  alreadySent: Set<string>
): ReminderGroup[] {
  const groups = new Map<string, ReminderGroup>();
  for (const slot of data.slots) {
    if (slot.date !== date || !slot.driverId) continue;
    if (!isNonDefaultReminderSlot(data, slot)) continue;
    const key = reminderKey(slot, slot.driverId);
    if (alreadySent.has(key)) continue;
    const person = data.people.find((p) => p.id === slot.driverId);
    if (!person) continue;
    const gkey = `${slot.driverId}::${slot.date}`;
    let group = groups.get(gkey);
    if (!group) {
      group = { driverId: slot.driverId, date: slot.date, person, slots: [] };
      groups.set(gkey, group);
    }
    group.slots.push(slot);
  }
  for (const group of groups.values()) {
    group.slots.sort(sortReminderSlots);
  }
  return [...groups.values()].sort((a, b) => a.person.name.localeCompare(b.person.name));
}

export function reminderEmailCopy(group: ReminderGroup, portalUrl: string): {
  subject: string;
  text: string;
  sms: string;
} {
  const niceDate = formatShiftDate(group.date);
  const shortDate = formatShortShiftDate(group.date);
  const labels = group.slots.map((s) => s.label);
  const bullets = labels.map((label) => `• ${label}`).join("\n");
  const covering =
    group.slots.length === 1
      ? `We just wanted to remind you that you’re scheduled tomorrow, ${shortDate}, covering a route that isn’t your normal route:`
      : `We just wanted to remind you that you’re scheduled tomorrow, ${shortDate}, covering routes that aren’t your normal routes:`;
  const subject =
    group.slots.length === 1
      ? `[Crystal Courier] Reminder: ${labels[0]} tomorrow (${group.date})`
      : `[Crystal Courier] Reminder: ${group.slots.length} shifts tomorrow (${group.date})`;
  const text = `Hi ${group.person.name},

${covering}

${bullets}
Date: ${niceDate}

Please double check the board when you arrive to confirm your routes and car assignment as things can change. For updates, check out the schedule here: ${portalUrl}

— Crystal Courier Dispatch Team

*Please let us know if anything has changed on your end.`;
  const sms =
    group.slots.length === 1
      ? `Crystal Courier: you’re on ${labels[0]} ${group.date}. ${portalUrl}`
      : `Crystal Courier: you’re on ${labels.join(", ")} ${group.date}. ${portalUrl}`;
  return { subject, text, sms };
}

export type ReminderRunResult = {
  today: string;
  tomorrow: string;
  localHour: number;
  sendWindowOpen: boolean;
  sent: number;
  /** Drivers who still need a real email (or SMS, if they have no email) after this run. */
  failed: number;
  details: string[];
  pending: string[];
  newRows: NonDefaultShiftReminder[];
};

export async function sendNonDefaultShiftReminders(params: {
  data: AppData;
  portalUrl: string;
  now?: Date;
}): Promise<ReminderRunResult> {
  const now = params.now ?? new Date();
  const today = calendarDateInTimeZone(now, BUSINESS_TIMEZONE);
  const tomorrow = addIsoDays(today, 1);
  const localHour = hourInTimeZone(now, BUSINESS_TIMEZONE);
  const sendWindowOpen = localHour >= REMINDER_SEND_AFTER_HOUR;

  const weekData = scheduleForDate(params.data, tomorrow);
  const sentKeys = new Set((params.data.nonDefaultShiftReminders ?? []).map((r) => r.key));
  const groups = collectReminderGroups(weekData, tomorrow, sentKeys);

  const pending = groups.map(
    (g) => `${g.person.name}: ${g.slots.map((s) => s.label).join(", ")} on ${g.date}`
  );

  const result: ReminderRunResult = {
    today,
    tomorrow,
    localHour,
    sendWindowOpen,
    sent: 0,
    failed: 0,
    details: [],
    pending,
    newRows: [],
  };

  if (!sendWindowOpen || groups.length === 0) {
    return result;
  }

  for (const group of groups) {
    const { subject, text, sms } = reminderEmailCopy(group, params.portalUrl);
    const email = group.person.email?.trim();
    const phone = group.person.phone?.trim();
    const stamp = new Date().toISOString();
    const labels = group.slots.map((s) => s.label).join(", ");

    // One message lists every non-default route for this driver tomorrow.
    // A console-only "send" does not count; the next scheduled run tries again.
    let emailDelivered = false;
    let smsDelivered = false;
    if (email) {
      const sendResult = await sendTransactionalEmail({
        to: email,
        subject,
        text,
      }).catch((e) => {
        console.error("[non-default reminder email]", e);
        return { ok: false as const, channel: "resend" as const, error: String(e) };
      });
      emailDelivered = sendResult.ok && sendResult.channel === "resend";
      if (!emailDelivered) {
        console.error(
          "[non-default reminder email]",
          sendResult.ok ? "not delivered (email provider not configured)" : sendResult.error
        );
      }
    }

    if (email && !emailDelivered) {
      result.failed += 1;
      result.details.push(`retry ${group.person.name}: email not delivered`);
      continue;
    }

    if (!email && phone) {
      const smsResult = await sendTransactionalSms({ to: phone, body: sms }).catch((e) => {
        console.error("[non-default reminder sms]", e);
        return { ok: false as const, channel: "twilio" as const };
      });
      smsDelivered = smsResult.ok && smsResult.channel === "twilio";
      if (!smsDelivered) {
        result.failed += 1;
        result.details.push(`retry ${group.person.name}: text not delivered`);
        continue;
      }
    }

    if (!email && !phone) {
      result.details.push(`waiting ${group.person.name}: no email or phone on file`);
      continue;
    }

    if (email && phone) {
      const smsResult = await sendTransactionalSms({ to: phone, body: sms }).catch((e) => {
        console.error("[non-default reminder sms]", e);
        return { ok: false as const, channel: "twilio" as const };
      });
      smsDelivered = smsResult.ok && smsResult.channel === "twilio";
    }

    for (const slot of group.slots) {
      const key = reminderKey(slot, group.driverId);
      result.newRows.push({ key, sentAt: stamp });
      sentKeys.add(key);
    }

    result.details.push(`${group.person.name}: ${labels} on ${group.date}`);
    appendActivity(params.data, {
      category: "reminder",
      summary: `Non-default shift reminder: ${group.person.name} — ${labels} on ${group.date}`,
      detail: emailDelivered && smsDelivered
        ? "Email and SMS sent"
        : emailDelivered
          ? "Email sent"
          : "SMS sent (no email on file)",
      at: stamp,
    });
  }

  result.sent = result.details.filter(
    (d) => !d.startsWith("retry ") && !d.startsWith("waiting ")
  ).length;
  result.pending = collectReminderGroups(weekData, tomorrow, sentKeys).map(
    (g) => `${g.person.name}: ${g.slots.map((s) => s.label).join(", ")} on ${g.date}`
  );
  return result;
}
