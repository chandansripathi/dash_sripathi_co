import { NextResponse } from "next/server";
import { audit, requireUser } from "@/lib/auth";
import { cloudflareRequest, type CloudflareRecord, type CloudflareZone } from "@/lib/cloudflare";
import { query } from "@/lib/db";

async function zoneForDomain(id: string) {
  const result = await query<{ name: string; cloudflare_connection_id: string | null; cloudflare_zone_id: string | null }>("SELECT name,cloudflare_connection_id,cloudflare_zone_id FROM domains WHERE id=$1", [id]);
  const domain = result.rows[0];
  if (!domain?.cloudflare_connection_id) throw new Error("Attach a Cloudflare connection first");
  let zoneId = domain.cloudflare_zone_id;
  if (!zoneId) {
    const zones = await cloudflareRequest<CloudflareZone[]>(domain.cloudflare_connection_id, `/zones?name=${encodeURIComponent(domain.name)}&per_page=50`);
    zoneId = zones[0]?.id;
    if (!zoneId) throw new Error("Domain was not found in this Cloudflare connection");
    await query("UPDATE domains SET cloudflare_zone_id=$2 WHERE id=$1", [id, zoneId]);
  }
  return { ...domain, zoneId };
}

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!await requireUser()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { id } = await params;
    const domain = await zoneForDomain(id);
    const records = await cloudflareRequest<CloudflareRecord[]>(domain.cloudflare_connection_id!, `/zones/${domain.zoneId}/dns_records?per_page=500`);
    return NextResponse.json({ records });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Cloudflare request failed" }, { status: 400 });
  }
}

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser(["admin", "operator"]);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const { id } = await params;
    const domain = await zoneForDomain(id);
    const records = await cloudflareRequest<CloudflareRecord[]>(domain.cloudflare_connection_id!, `/zones/${domain.zoneId}/dns_records?per_page=500`);
    let imported = 0;
    for (const record of records.filter((item) => ["A", "AAAA", "CNAME"].includes(item.type))) {
      await query(`INSERT INTO subdomains (domain_id,name,dns_name,record_type,ipv4,proxied,source)
        VALUES ($1,$2,$3,$4,$5,$6,'cloudflare') ON CONFLICT (domain_id,name) DO UPDATE SET
        dns_name=EXCLUDED.dns_name,record_type=EXCLUDED.record_type,ipv4=EXCLUDED.ipv4,proxied=EXCLUDED.proxied,source='cloudflare',updated_at=now()`,
        [id, record.name, record.name === domain.name ? "@" : record.name.slice(0, -(domain.name.length + 1)), record.type,
          record.type === "A" ? record.content : record.content, Boolean(record.proxied)]);
      imported += 1;
    }
    await audit(user.id, "cloudflare.sync", "domain", id, { imported });
    return NextResponse.json({ imported });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Cloudflare sync failed" }, { status: 400 });
  }
}
