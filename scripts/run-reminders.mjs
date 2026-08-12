/**
 * Render Cron Job entrypoint: GET /api/cron/reminders on the live web service.
 * Requires APP_PUBLIC_URL. Sends Authorization: Bearer CRON_SECRET when that env is set.
 */
const base = (process.env.APP_PUBLIC_URL ?? "").replace(/\/$/, "");
if (!base) {
  console.error("APP_PUBLIC_URL is required (your Render web service URL).");
  process.exit(1);
}

const headers = {};
const secret = process.env.CRON_SECRET?.trim();
if (secret) {
  headers.Authorization = `Bearer ${secret}`;
}

const url = `${base}/api/cron/reminders`;
const res = await fetch(url, { headers });
const body = await res.text();
console.log(res.status, body);
if (!res.ok) {
  process.exit(1);
}
