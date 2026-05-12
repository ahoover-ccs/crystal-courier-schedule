import { NextResponse } from "next/server";
import { applyDefaultDriversToEmptySlots } from "@/lib/apply-defaults";
import { ensureDb, writeDb } from "@/lib/db";

/** Reload from disk and fill only empty non-gap cells from Settings defaults (does not undo manual assignments). */
export async function POST() {
  const data = await ensureDb();
  const { data: next, errors } = applyDefaultDriversToEmptySlots(data);
  await writeDb(next);
  return NextResponse.json({ data: next, errors });
}
