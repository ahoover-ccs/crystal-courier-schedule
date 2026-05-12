import { NextRequest, NextResponse } from "next/server";
import { ensureDb, writeDb } from "@/lib/db";
import { normalizeWeeklyAvailability } from "@/lib/availability-helpers";
import type { WeeklyShiftAvailability } from "@/lib/types";
import { roleNeedsProfileToken } from "@/lib/roles";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token?.trim()) {
    return NextResponse.json({ error: "token required" }, { status: 400 });
  }
  const data = await ensureDb();
  const person = data.people.find((p) => p.profileToken === token.trim());
  if (!person || !roleNeedsProfileToken(person.role)) {
    return NextResponse.json({ error: "Invalid or expired link" }, { status: 404 });
  }
  return NextResponse.json({
    name: person.name,
    role: person.role,
    weeklyShiftAvailability: normalizeWeeklyAvailability(person.weeklyShiftAvailability),
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { token, weeklyShiftAvailability } = body as {
    token: string;
    weeklyShiftAvailability: WeeklyShiftAvailability;
  };
  if (!token?.trim() || !weeklyShiftAvailability) {
    return NextResponse.json(
      { error: "token and weeklyShiftAvailability required" },
      { status: 400 }
    );
  }
  const data = await ensureDb();
  const idx = data.people.findIndex((p) => p.profileToken === token.trim());
  if (idx === -1) {
    return NextResponse.json({ error: "Invalid or expired link" }, { status: 404 });
  }
  const person = data.people[idx];
  if (!roleNeedsProfileToken(person.role)) {
    return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  }
  data.people[idx] = {
    ...person,
    weeklyShiftAvailability: normalizeWeeklyAvailability(weeklyShiftAvailability),
  };
  await writeDb(data);
  return NextResponse.json({
    ok: true,
    weeklyShiftAvailability: data.people[idx].weeklyShiftAvailability,
  });
}
