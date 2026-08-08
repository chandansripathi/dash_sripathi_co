import { NextResponse } from "next/server";
import { audit, requireUser } from "@/lib/auth";
import { cloudflareRequest, type CloudflareZone } from "@/lib/cloudflare";
import { encryptSecret } from "@/lib/crypto";
import { query } from "@/lib/db";

export async function GET() {
  if (!await requireUser()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const result = await query("SELECT id,name,account_hint,created_at,updated_at FROM cloudflare_connections ORDER BY name");
  return NextResponse.json({ connections: result.rows });
}

export async function POST(request: Request) {
  const user = await requireUser(["admin"]);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const b = await request.json();
  const token = String(b.token || "").trim();
  if (!token) return NextResponse.json({ error: "API token is required" }, { status: 400 });
  const result = await query<{ id: string }>("INSERT INTO cloudflare_connections (name,account_hint,token_encrypted) VALUES ($1,$2,$3) RETURNING id", [b.name || "Cloudflare", b.accountHint || null, encryptSecret(token)]);
  try {
    const zones = await cloudflareRequest<CloudflareZone[]>(result.rows[0].id, "/zones?per_page=50");
    await audit(user.id, "cloudflare.create", "cloudflare_connection", result.rows[0].id, { zones: zones.length });
    return NextResponse.json({ id: result.rows[0].id, zones: zones.length }, { status: 201 });
  } catch (error) {
    await query("DELETE FROM cloudflare_connections WHERE id=$1", [result.rows[0].id]);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Token validation failed" }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  const user = await requireUser(["admin"]);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Connection id is required" }, { status: 400 });
  await query("UPDATE domains SET cloudflare_connection_id=NULL,cloudflare_zone_id=NULL,updated_at=now() WHERE cloudflare_connection_id=$1", [id]);
  const result = await query("DELETE FROM cloudflare_connections WHERE id=$1 RETURNING id", [id]);
  if (!result.rowCount) return NextResponse.json({ error: "Connection not found" }, { status: 404 });
  await audit(user.id, "cloudflare.delete", "cloudflare_connection", id);
  return NextResponse.json({ ok: true });
}
