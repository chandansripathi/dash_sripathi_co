import { NextResponse } from "next/server";
import { audit, requireUser } from "@/lib/auth";
import { query } from "@/lib/db";

export async function GET() {
  if (!await requireUser()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const result = await query(`SELECT d.*,c.name AS cloudflare_connection_name,
    (SELECT count(*)::int FROM subdomains s WHERE s.domain_id=d.id) AS subdomain_count
    FROM domains d LEFT JOIN cloudflare_connections c ON c.id=d.cloudflare_connection_id ORDER BY d.expires_at NULLS LAST,d.name`);
  return NextResponse.json({ domains: result.rows });
}

export async function POST(request: Request) {
  const user = await requireUser(["admin", "operator"]);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const b = await request.json();
  const name = String(b.name || "").trim().toLowerCase();
  if (!name.includes(".")) return NextResponse.json({ error: "Enter a valid domain" }, { status: 400 });
  const result = await query<{ id: string }>(`INSERT INTO domains
    (name,tld,provider,current_price,registered_at,last_renewed_at,expires_at,renewal_price,currency,hosting,dns_provider,notes,free_tier,cloudflare_connection_id)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id`,
    [name, name.split(".").slice(1).join("."), b.provider || null, b.currentPrice || null, b.registeredAt || null,
      b.lastRenewedAt || null, b.expiresAt || null, b.renewalPrice || null, b.currency || "INR", b.hosting || null,
      b.dnsProvider || null, b.notes || null, Boolean(b.freeTier), b.cloudflareConnectionId || null]);
  await audit(user.id, "domain.create", "domain", result.rows[0].id, { name });
  return NextResponse.json({ id: result.rows[0].id }, { status: 201 });
}
