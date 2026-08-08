import { NextResponse } from "next/server";
import { audit, requireUser } from "@/lib/auth";
import { hashPassword } from "@/lib/crypto";
import { query } from "@/lib/db";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!await requireUser(["admin"])) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const result = await query("SELECT id,name,email,role,active,avatar_path,created_at,updated_at FROM users WHERE id=$1", [id]);
  if (!result.rows[0]) return NextResponse.json({ error: "User not found" }, { status: 404 });
  return NextResponse.json({ user: result.rows[0] });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await requireUser(["admin"]);
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const target = await query<{ role: string }>("SELECT role FROM users WHERE id=$1", [id]);
  if (!target.rows[0]) return NextResponse.json({ error: "User not found" }, { status: 404 });
  if (target.rows[0].role === "admin") return NextResponse.json({ error: "Administrator accounts cannot be edited" }, { status: 400 });
  const body = await request.json();
  if (body.password && String(body.password).length < 12) return NextResponse.json({ error: "Password must be at least 12 characters" }, { status: 400 });
  await query(`UPDATE users SET name=COALESCE($2,name),email=COALESCE(lower($3),email),role=COALESCE($4,role),active=COALESCE($5,active),
    password_hash=COALESCE($6,password_hash),updated_at=now() WHERE id=$1`, [id, body.name || null, body.email || null, body.role || null,
    typeof body.active === "boolean" ? body.active : null, body.password ? await hashPassword(String(body.password)) : null]);
  await audit(actor.id, "user.update", "user", id);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await requireUser(["admin"]);
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const target = await query<{ role: string }>("SELECT role FROM users WHERE id=$1", [id]);
  if (!target.rows[0]) return NextResponse.json({ error: "User not found" }, { status: 404 });
  if (target.rows[0].role === "admin") return NextResponse.json({ error: "Administrator accounts cannot be deleted" }, { status: 400 });
  await query("DELETE FROM users WHERE id=$1", [id]);
  await audit(actor.id, "user.delete", "user", id);
  return NextResponse.json({ ok: true });
}
