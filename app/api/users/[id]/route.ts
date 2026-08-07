import { NextResponse } from "next/server";
import { audit, requireUser } from "@/lib/auth";
import { hashPassword } from "@/lib/crypto";
import { query } from "@/lib/db";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await requireUser(["admin"]);
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const body = await request.json();
  if (body.password && String(body.password).length < 12) return NextResponse.json({ error: "Password must be at least 12 characters" }, { status: 400 });
  await query(`UPDATE users SET name=COALESCE($2,name),email=COALESCE(lower($3),email),role=COALESCE($4,role),active=COALESCE($5,active),
    password_hash=COALESCE($6,password_hash),updated_at=now() WHERE id=$1`, [id, body.name || null, body.email || null, body.role || null,
    typeof body.active === "boolean" ? body.active : null, body.password ? await hashPassword(String(body.password)) : null]);
  await audit(actor.id, "user.update", "user", id);
  return NextResponse.json({ ok: true });
}
