import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getUser } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET() {
  const [{ rows }, user] = await Promise.all([query<{ count: string }>("SELECT count(*) AS count FROM users"), getUser()]);
  return NextResponse.json({ needsSetup: Number(rows[0].count) === 0, user });
}
