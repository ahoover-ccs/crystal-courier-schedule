import { NextRequest, NextResponse } from "next/server";
import { ensureDb, writeDb } from "@/lib/db";
import { terminatePersonInData } from "@/lib/terminate-person";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const body = await req.json();
  const { effectiveDate } = body as { effectiveDate?: string };
  if (!effectiveDate || !/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate)) {
    return NextResponse.json({ error: "effectiveDate (YYYY-MM-DD) required" }, { status: 400 });
  }

  const data = await ensureDb();
  const person = data.people.find((p) => p.id === id);
  if (!person) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (person.terminatedAt) {
    return NextResponse.json({ error: "Already terminated" }, { status: 409 });
  }

  terminatePersonInData(data, id, effectiveDate);
  await writeDb(data);
  return NextResponse.json(data);
}
