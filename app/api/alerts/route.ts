import { NextResponse } from "next/server";
import { audit, requireUser } from "@/lib/auth";
import { query } from "@/lib/db";

export async function GET() {
  if (!await requireUser()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const result = await query("SELECT * FROM alerts ORDER BY resolved_at NULLS FIRST,created_at DESC LIMIT 200");
  return NextResponse.json({ alerts: result.rows });
}

export async function PATCH(request: Request) {
  const user = await requireUser(["admin", "operator"]);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const b = await request.json();
  await query("UPDATE alerts SET resolved_at=CASE WHEN $2 THEN now() ELSE NULL END WHERE id=$1", [b.id, b.resolved !== false]);
  await audit(user.id, "alert.resolve", "alert", b.id);
  return NextResponse.json({ ok: true });
}
