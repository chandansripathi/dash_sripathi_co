import { NextResponse } from "next/server";
import { audit, requireUser } from "@/lib/auth";
import { query } from "@/lib/db";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser(["admin", "operator"]);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const b = await request.json();
  const result = await query<{ id: string }>(`INSERT INTO subdomains
    (domain_id,name,dns_name,record_type,service,host,path,ipv4,proxied,source,notes)
    VALUES ($1,lower($2),$3,$4,$5,$6,$7,$8,$9,$10,$11)
    ON CONFLICT (domain_id,name) DO UPDATE SET dns_name=EXCLUDED.dns_name,record_type=EXCLUDED.record_type,service=EXCLUDED.service,
    host=EXCLUDED.host,path=EXCLUDED.path,ipv4=EXCLUDED.ipv4,proxied=EXCLUDED.proxied,notes=EXCLUDED.notes,updated_at=now() RETURNING id`,
    [id, b.name, b.dnsName || null, b.recordType || null, b.service || null, b.host || null, b.path || null,
      b.ipv4 || null, typeof b.proxied === "boolean" ? b.proxied : null, b.source || "manual", b.notes || null]);
  await audit(user.id, "subdomain.upsert", "subdomain", result.rows[0].id);
  return NextResponse.json({ id: result.rows[0].id });
}
