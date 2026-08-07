import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { createSession, audit } from "@/lib/auth";
import { verifyPassword } from "@/lib/crypto";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await request.json();
  const email = String(body.email || "").trim().toLowerCase();
  const result = await query<{ id: string; password_hash: string; active: boolean }>("SELECT id,password_hash,active FROM users WHERE lower(email)=$1", [email]);
  const user = result.rows[0];
  if (!user || !user.active || !(await verifyPassword(String(body.password || ""), user.password_hash))) {
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  }
  await createSession(user.id);
  await audit(user.id, "auth.login", "user", user.id);
  return NextResponse.json({ ok: true });
}
