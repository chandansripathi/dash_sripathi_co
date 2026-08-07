import { NextResponse } from "next/server";
import { audit, requireUser } from "@/lib/auth";
import { query } from "@/lib/db";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!await requireUser()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const [domain, subdomains] = await Promise.all([
    query(`SELECT d.*,c.name AS cloudflare_connection_name FROM domains d LEFT JOIN cloudflare_connections c ON c.id=d.cloudflare_connection_id WHERE d.id=$1`, [id]),
    query("SELECT * FROM subdomains WHERE domain_id=$1 ORDER BY name", [id]),
  ]);
  if (!domain.rows[0]) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ domain: domain.rows[0], subdomains: subdomains.rows });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser(["admin", "operator"]);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const b = await request.json();
  await query(`UPDATE domains SET name=COALESCE($2,name),provider=$3,current_price=$4,registered_at=$5,last_renewed_at=$6,
    expires_at=$7,renewal_price=$8,currency=COALESCE($9,currency),hosting=$10,dns_provider=$11,notes=$12,free_tier=COALESCE($13,free_tier),
    cloudflare_connection_id=$14,updated_at=now() WHERE id=$1`, [id, b.name || null, b.provider || null, b.currentPrice || null,
    b.registeredAt || null, b.lastRenewedAt || null, b.expiresAt || null, b.renewalPrice || null, b.currency || null,
    b.hosting || null, b.dnsProvider || null, b.notes || null, typeof b.freeTier === "boolean" ? b.freeTier : null, b.cloudflareConnectionId || null]);
  await audit(user.id, b.markRenewed ? "domain.renew" : "domain.update", "domain", id);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser(["admin"]);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  await query("DELETE FROM domains WHERE id=$1", [id]);
  await audit(user.id, "domain.delete", "domain", id);
  return NextResponse.json({ ok: true });
}
