import { NextRequest, NextResponse } from "next/server";
import { ensureDb, writeDb } from "@/lib/db";
import { sendTransactionalEmail } from "@/lib/email-sender";
import { newProfileToken } from "@/lib/profile-token";
import { roleNeedsProfileToken } from "@/lib/roles";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { email, baseUrl } = body as { email?: string; baseUrl?: string };
  const addr = email?.trim().toLowerCase();
  if (!addr) {
    return NextResponse.json({ error: "email required" }, { status: 400 });
  }
  const data = await ensureDb();
  const person = data.people.find((p) => p.email?.trim().toLowerCase() === addr);
  if (!person || !roleNeedsProfileToken(person.role)) {
    return NextResponse.json(
      { error: "No driver profile found for that email." },
      { status: 404 }
    );
  }
  const token = person.profileToken ?? newProfileToken();
  const idx = data.people.findIndex((p) => p.id === person.id);
  data.people[idx] = { ...person, profileToken: token };
  await writeDb(data);

  const origin =
    baseUrl?.replace(/\/$/, "") ||
    process.env.APP_PUBLIC_URL?.replace(/\/$/, "") ||
    "http://localhost:3000";
  const link = `${origin}/my-availability?t=${encodeURIComponent(token)}`;

  await sendTransactionalEmail({
    to: person.email!,
    subject: "Your Crystal Courier availability link",
    text: `Hi ${person.name},\n\nUse this link to set which days and shifts you are available for fill-in routes:\n\n${link}\n\nIf you did not request this, you can ignore this email.\n`,
  }).catch((e) => console.error("[send-link]", e));

  return NextResponse.json({ ok: true });
}
