import { NextResponse } from "next/server";
import { audit, requireUser } from "@/lib/auth";
import { hashPassword } from "@/lib/crypto";
import { query } from "@/lib/db";

export async function GET() {
  if (!await requireUser(["admin"])) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const result = await query("SELECT id,name,email,role,active,created_at FROM users ORDER BY created_at");
  return NextResponse.json({ users: result.rows });
}

export async function POST(request: Request) {
  const actor = await requireUser(["admin"]);
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await request.json();
  const password = String(body.password || "");
  if (password.length < 12) return NextResponse.json({ error: "Password must be at least 12 characters" }, { status: 400 });
  const result = await query<{ id: string }>("INSERT INTO users (name,email,password_hash,role) VALUES ($1,lower($2),$3,$4) RETURNING id", [body.name, body.email, await hashPassword(password), body.role || "viewer"]);
  await audit(actor.id, "user.create", "user", result.rows[0].id);
  return NextResponse.json({ id: result.rows[0].id }, { status: 201 });
}
