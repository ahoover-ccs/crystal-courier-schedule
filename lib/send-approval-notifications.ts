import { sendTransactionalEmail } from "./email-sender";
import { sendTransactionalSms } from "./sms-sender";
import type { Person, RouteType } from "./types";

function routeTypeLine(types: RouteType[]): string {
  return types.join(", ");
}

/** Email + SMS to the driver after time off is approved. */
export async function notifyTimeOffApprovedToDriver(params: {
  person: Person;
  dates: string[];
  routeTypes: RouteType[];
  scheduleUrl: string;
}): Promise<void> {
  const dateLine =
    params.dates.length === 1
      ? params.dates[0]
      : `${params.dates[0]} through ${params.dates[params.dates.length - 1]} (${params.dates.length} days)`;
  const subject = `[Crystal Courier] Time off approved — ${params.person.name}`;
  const text = `Hi ${params.person.name},

Hooray! Your time off request has been approved. Enjoy your time off but, before you go, please remember to clean (at least) the interior of your car and fuel up. Whoever covers your shift will likely be in your vehicle so we ask that you show them respect and appreciation for covering your route(s).

We will provide coverage for:
Dates: ${dateLine}
Route types: ${routeTypeLine(params.routeTypes)}

You can confirm the schedule here: ${params.scheduleUrl}

— Crystal Courier Management`;

  const email = params.person.email?.trim();
  if (email) {
    await sendTransactionalEmail({ to: email, subject, text }).catch((e) =>
      console.error("[approval email time-off]", e)
    );
  }
  const phone = params.person.phone?.trim();
  if (phone) {
    const sms = `Crystal Courier: your time off for ${dateLine} is approved. Schedule: ${params.scheduleUrl}`;
    await sendTransactionalSms({ to: phone, body: sms }).catch((e) =>
      console.error("[approval sms time-off]", e)
    );
  }
  if (!email && !phone) {
    console.warn("[approval notify time-off] no email or phone for", params.person.name);
  }
}

/** Email to the driver after time off is rejected. */
export async function notifyTimeOffRejectedToDriver(params: {
  person: Person;
  dates: string[];
  routeTypes: RouteType[];
}): Promise<void> {
  const dateLine =
    params.dates.length === 1
      ? params.dates[0]
      : `${params.dates[0]} through ${params.dates[params.dates.length - 1]} (${params.dates.length} days)`;
  const subject = `[Crystal Courier] Time off not approved — ${params.person.name}`;
  const text = `Hi ${params.person.name},

Unfortunately, we were not able to approve your time off request. Please chat with a member of management to see if anything can be done.

Dates: ${dateLine}
Route types: ${routeTypeLine(params.routeTypes)}

— Crystal Courier`;

  const email = params.person.email?.trim();
  if (email) {
    await sendTransactionalEmail({ to: email, subject, text }).catch((e) =>
      console.error("[rejection email time-off]", e)
    );
  } else {
    console.warn("[rejection notify time-off] no email for", params.person.name);
  }
}

/** Email + SMS after an open-shift sign-up is approved. */
export async function notifyShiftSignUpApprovedToDriver(params: {
  person: Person;
  label: string;
  date: string;
  scheduleUrl: string;
}): Promise<void> {
  const subject = `[Crystal Courier] Shift sign-up approved — ${params.label}`;
  const text = `Hi ${params.person.name},

Your sign-up for this open shift has been approved:

• ${params.label}
• ${params.date}

You’re on the schedule. View it here: ${params.scheduleUrl}

— Crystal Courier`;

  const email = params.person.email?.trim();
  if (email) {
    await sendTransactionalEmail({ to: email, subject, text }).catch((e) =>
      console.error("[approval email shift]", e)
    );
  }
  const phone = params.person.phone?.trim();
  if (phone) {
    const sms = `Crystal Courier: your sign-up for ${params.label} on ${params.date} is approved. ${params.scheduleUrl}`;
    await sendTransactionalSms({ to: phone, body: sms }).catch((e) =>
      console.error("[approval sms shift]", e)
    );
  }
  if (!email && !phone) {
    console.warn("[approval notify shift] no email or phone for", params.person.name);
  }
}
