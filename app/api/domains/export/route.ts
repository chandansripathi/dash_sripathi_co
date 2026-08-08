import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";

export async function GET() {
  if (!await requireUser()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const [domains, subdomains] = await Promise.all([
    query(`SELECT d.name,d.tld,d.provider,d.current_price,d.registered_at,d.last_renewed_at,d.expires_at,d.renewal_price,d.currency,d.hosting,d.dns_provider,d.free_tier,d.notes,
      c.name AS cloudflare_connection,c.account_hint AS cloudflare_account_hint,''::text AS cloudflare_api_token
      FROM domains d LEFT JOIN cloudflare_connections c ON c.id=d.cloudflare_connection_id ORDER BY d.name`),
    query("SELECT d.name AS domain,s.name,s.dns_name,s.record_type,s.service,s.host,s.path,s.ipv4,s.proxied,s.source,s.notes FROM subdomains s JOIN domains d ON d.id=s.domain_id ORDER BY d.name,s.name"),
  ]);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Nexus";
  const domainSheet = workbook.addWorksheet("Domains", { views: [{ state: "frozen", ySplit: 1 }] });
  domainSheet.columns = ["Domain","TLD","Provider","Current Price","Registered","Last Renewed","Expires","Renewal Price","Currency","Hosting","DNS Provider","Free Tier","Notes","Cloudflare Connection","Cloudflare Account Hint","Cloudflare API Token"].map((header) => ({ header, key: header, width: 22 }));
  domains.rows.forEach((row) => domainSheet.addRow(Object.values(row)));
  domainSheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } }; domainSheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2563EB" } };
  const subSheet = workbook.addWorksheet("Subdomains", { views: [{ state: "frozen", ySplit: 1 }] });
  subSheet.columns = ["Domain","Subdomain","DNS Name","Record Type","Service","Host","Path / Proxy","IPv4","Proxied","Source","Notes"].map((header) => ({ header, key: header, width: 22 }));
  subdomains.rows.forEach((row) => subSheet.addRow(Object.values(row)));
  subSheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } }; subSheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF7C3AED" } };
  const output = await workbook.xlsx.writeBuffer();
  return new NextResponse(Buffer.from(output), { headers: { "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "content-disposition": `attachment; filename="nexus-domains-${new Date().toISOString().slice(0,10)}.xlsx"` } });
}
