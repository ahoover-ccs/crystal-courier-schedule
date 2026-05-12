import { NextResponse } from "next/server";
import { ensureDb, readDb } from "@/lib/db";

export async function GET() {
  const data = await ensureDb();
  return NextResponse.json(data);
}

export async function POST() {
  const data = await readDb();
  return NextResponse.json(data);
}
