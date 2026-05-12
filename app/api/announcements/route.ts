import { NextRequest, NextResponse } from "next/server";
import { ensureDb, writeDb } from "@/lib/db";
import { sendTransactionalEmail } from "@/lib/email-sender";
import { sendTransactionalSms } from "@/lib/sms-sender";
import type { Announcement } from "@/lib/types";

function publicAppUrl(req: NextRequest): string {
  const fromEnv = (process.env.APP_PUBLIC_URL ?? "").replace(/\/$/, "");
  if (fromEnv) return fromEnv;
  return new URL(req.url).origin;
}

export async function GET() {
  const data = await ensureDb();
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const recent = (data.announcements ?? [])
    .filter((a) => new Date(a.createdAt).getTime() >= cutoff)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return NextResponse.json({ announcements: recent });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { subject, body: textBody, createdByName } = body as {
    subject: string;
    body: string;
    createdByName?: string;
  };
  if (!subject?.trim() || !textBody?.trim()) {
    return NextResponse.json({ error: "subject and body required" }, { status: 400 });
  }
  const data = await ensureDb();
  const row: Announcement = {
    id: `ann-${Date.now()}`,
    subject: subject.trim(),
    body: textBody.trim(),
    createdAt: new Date().toISOString(),
    createdByName: createdByName?.trim(),
  };
  data.announcements = [...(data.announcements ?? []), row];
  await writeDb(data);

  const base = publicAppUrl(req);
  const boardUrl = `${base}/announcements`;
  const mailBody = `${row.body}\n\nView on the board: ${boardUrl}\n\n— Crystal Courier internal schedule`;

  const emails = data.people
    .map((p) => p.email?.trim())
    .filter((e): e is string => Boolean(e));
  const uniqueEmails = [...new Set(emails)];
  if (uniqueEmails.length) {
    await sendTransactionalEmail({
      to: uniqueEmails,
      subject: `[Crystal Courier] ${row.subject}`,
      text: mailBody,
    }).catch((e) => console.error("[announcement email]", e));
  }

  const smsBody = `Crystal Courier: ${row.subject}\n\n${row.body.slice(0, 280)}${row.body.length > 280 ? "…" : ""}\n\n${boardUrl}`;
  for (const p of data.people) {
    const phone = p.phone?.trim();
    if (!phone) continue;
    await sendTransactionalSms({ to: phone, body: smsBody }).catch((e) =>
      console.error("[announcement sms]", p.name, e)
    );
  }

  return NextResponse.json({ data, announcement: row });
}
