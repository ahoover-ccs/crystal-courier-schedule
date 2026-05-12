import { sendTransactionalEmail } from "./email-sender";
import type { RouteType } from "./types";

const DEFAULT_NOTIFY = "ahoover@crystalcourier.com";

function routeLabels(types: RouteType[]): string {
  return types.join(", ");
}

export async function notifyTimeOffRequest(params: {
  driverName: string;
  dates: string[];
  routeTypes: RouteType[];
  note?: string;
}): Promise<{ ok: boolean; channel: "resend" | "log" }> {
  const to = process.env.TIME_OFF_NOTIFY_EMAIL ?? DEFAULT_NOTIFY;
  const dateLine =
    params.dates.length === 1
      ? `Date: ${params.dates[0]}`
      : `Dates (${params.dates.length}): ${params.dates.join(", ")}`;
  const subject =
    params.dates.length === 1
      ? `[Action needed] Time off request: ${params.driverName} — ${params.dates[0]}`
      : `[Action needed] Time off request: ${params.driverName} — ${params.dates[0]} … ${params.dates[params.dates.length - 1]}`;
  const text = [
    `Driver: ${params.driverName}`,
    dateLine,
    `Route types: ${routeLabels(params.routeTypes)}`,
    params.note ? `Note: ${params.note}` : "",
    "",
    "Status: pending approval. Review and approve or reject in the app under Approvals Needed.",
    "",
    "This was submitted through the Crystal Courier scheduling app.",
  ]
    .filter(Boolean)
    .join("\n");

  return sendTransactionalEmail({ to, subject, text });
}
