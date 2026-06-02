import { NextRequest, NextResponse } from "next/server";
import { ensureDb, writeDb } from "@/lib/db";
import { normalizeWeeklyAvailability } from "@/lib/availability-helpers";
import { newProfileToken } from "@/lib/profile-token";
import { roleNeedsProfileToken } from "@/lib/roles";
import type { PersonRole, WeekdayKey, WeeklyShiftAvailability } from "@/lib/types";
import { WEEKDAY_KEYS } from "@/lib/types";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const body = await req.json();
  const { name, role, email, phone, weeklyShiftAvailability, regenerateProfileToken } = body as {
    name?: string;
    role?: PersonRole;
    email?: string;
    phone?: string;
    weeklyShiftAvailability?: WeeklyShiftAvailability;
    regenerateProfileToken?: boolean;
  };
  const data = await ensureDb();
  const idx = data.people.findIndex((p) => p.id === id);
  if (idx === -1) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const cur = data.people[idx];
  let nextRole = role ?? cur.role;
  let profileToken = cur.profileToken;
  if (regenerateProfileToken && roleNeedsProfileToken(nextRole)) {
    profileToken = newProfileToken();
  }
  if (roleNeedsProfileToken(nextRole) && !profileToken) {
    profileToken = newProfileToken();
  }
  const mergedWeekly = weeklyShiftAvailability
    ? normalizeWeeklyAvailability(weeklyShiftAvailability)
    : normalizeWeeklyAvailability(cur.weeklyShiftAvailability);

  data.people[idx] = {
    ...cur,
    name: name?.trim() ?? cur.name,
    role: nextRole,
    email: email !== undefined ? email.trim() || undefined : cur.email,
    phone: phone !== undefined ? phone.trim() || undefined : cur.phone,
    weeklyShiftAvailability: mergedWeekly,
    profileToken: roleNeedsProfileToken(nextRole) ? profileToken : undefined,
  };
  await writeDb(data);
  return NextResponse.json(data);
}

/** @deprecated Use POST /api/people/[id]/terminate with an effective date instead. */
export async function DELETE(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  let effectiveDate: string | undefined;
  try {
    const body = await req.json();
    effectiveDate = (body as { effectiveDate?: string }).effectiveDate;
  } catch {
    /* no body */
  }
  if (!effectiveDate) {
    return NextResponse.json(
      {
        error:
          "Termination requires an effective date. Use POST /api/people/{id}/terminate with { effectiveDate }.",
      },
      { status: 400 }
    );
  }
  const data = await ensureDb();
  if (!data.people.some((p) => p.id === id)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const { terminatePersonInData } = await import("@/lib/terminate-person");
  terminatePersonInData(data, id, effectiveDate);
  await writeDb(data);
  return NextResponse.json(data);
}
