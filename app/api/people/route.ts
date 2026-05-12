import { NextRequest, NextResponse } from "next/server";
import { ensureDb, writeDb } from "@/lib/db";
import { createDefaultWeeklyShiftAvailability } from "@/lib/availability-helpers";
import { newProfileToken } from "@/lib/profile-token";
import { roleNeedsProfileToken } from "@/lib/roles";
import type { PersonRole } from "@/lib/types";

function newId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return `p-${crypto.randomUUID()}`;
  }
  return `p-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { name, role, email, phone } = body as {
    name: string;
    role: PersonRole;
    email?: string;
    phone?: string;
  };
  if (!name?.trim() || !role) {
    return NextResponse.json({ error: "name and role required" }, { status: 400 });
  }
  const data = await ensureDb();
  const id = newId();
  const person = {
    id,
    name: name.trim(),
    role,
    email: email?.trim() || undefined,
    phone: phone?.trim() || undefined,
    weeklyShiftAvailability: createDefaultWeeklyShiftAvailability(),
    ...(roleNeedsProfileToken(role) ? { profileToken: newProfileToken() } : {}),
  };
  data.people.push(person);
  if (!data.settings.fillPriorityIds.includes(id)) {
    data.settings.fillPriorityIds.push(id);
  }
  await writeDb(data);
  return NextResponse.json(data);
}
