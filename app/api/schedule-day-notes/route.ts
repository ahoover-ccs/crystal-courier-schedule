import { NextRequest, NextResponse } from "next/server";
import { ensureDb, writeDb } from "@/lib/db";
import { upsertDayNote } from "@/lib/schedule-day-notes";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { date, text, authorName } = body as {
    date?: string;
    text?: string;
    authorName?: string;
  };
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "date (YYYY-MM-DD) required" }, { status: 400 });
  }
  if (text === undefined || text === null) {
    return NextResponse.json({ error: "text required (use empty string to clear)" }, { status: 400 });
  }

  let data = await ensureDb();
  upsertDayNote(data, date, String(text), authorName);
  await writeDb(data);
  return NextResponse.json(data);
}
