import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { createSession, audit } from "@/lib/auth";
import { hashPassword } from "@/lib/crypto";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const count = Number((await query<{ count: string }>("SELECT count(*) AS count FROM users")).rows[0].count);
  if (count) return NextResponse.json({ error: "Setup is already complete" }, { status: 409 });
  const body = await request.json();
  const name = String(body.name || "").trim();
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  if (!name || !email.includes("@") || password.length < 12) return NextResponse.json({ error: "Use a valid name, email, and a 12+ character password" }, { status: 400 });
  const result = await query<{ id: string }>("INSERT INTO users (name,email,password_hash,role) VALUES ($1,$2,$3,'admin') RETURNING id", [name, email, await hashPassword(password)]);
  await createSession(result.rows[0].id);
  await audit(result.rows[0].id, "auth.setup", "user", result.rows[0].id);
  return NextResponse.json({ ok: true });
}
