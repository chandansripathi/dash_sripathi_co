import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { audit, requireUser } from "@/lib/auth";
import { encryptSecret } from "@/lib/crypto";
import { transaction } from "@/lib/db";

function text(value: ExcelJS.CellValue) {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object" && "text" in value) return String(value.text).trim();
  if (typeof value === "object" && "result" in value) return String(value.result ?? "").trim();
  if (typeof value === "object" && "richText" in value) return value.richText.map((part) => part.text).join("").trim();
  return String(value).trim();
}

const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

function date(value: ExcelJS.CellValue) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "number") return new Date(Math.round((value - 25569) * 86400000)).toISOString().slice(0, 10);
  const raw = text(value);
  const match = raw.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (match) return `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
  const parsed = Date.parse(raw);
  return raw && Number.isFinite(parsed) ? new Date(parsed).toISOString().slice(0, 10) : null;
}

function number(value: ExcelJS.CellValue) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const normalized = text(value).replace(/[^\d.-]/g, "");
  if (!normalized || normalized === "-" || normalized === ".") return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function boolean(value: ExcelJS.CellValue) {
  if (typeof value === "boolean") return value;
  const normalized = normalize(text(value));
  if (["true", "yes", "y", "1", "free"].includes(normalized)) return true;
  if (["false", "no", "n", "0", "paid"].includes(normalized)) return false;
  return null;
}

function rows(sheet: ExcelJS.Worksheet, required: string) {
  let headers: Record<string, number> | null = null;
  const output: ExcelJS.CellValue[][] = [];
  sheet.eachRow((row) => {
    const values = row.values as ExcelJS.CellValue[];
    const labels = Array.from({ length: values.length }, (_, index) => normalize(text(values[index])));
    if (!headers && labels.includes(required)) {
      headers = Object.fromEntries(labels.flatMap((label, index) => label ? [[label, index]] : []));
      return;
    }
    if (headers) output.push(values);
  });
  return { headers: headers as Record<string, number> | null, rows: output };
}

function cell(values: ExcelJS.CellValue[], headers: Record<string, number>, ...names: string[]) {
  for (const name of names) {
    const index = headers[normalize(name)];
    if (typeof index === "number" && index > 0) return values[index];
  }
  return null;
}

export async function POST(request: Request) {
  const user = await requireUser(["admin", "operator"]);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const file = (await request.formData()).get("file");
  if (!(file instanceof File) || file.size > 25 * 1024 * 1024) return NextResponse.json({ error: "Choose an Excel file under 25 MB" }, { status: 400 });

  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(Buffer.from(await file.arrayBuffer()) as never);
  } catch {
    return NextResponse.json({ error: "That file is not a readable Excel workbook" }, { status: 400 });
  }

  const domainSheet = workbook.getWorksheet("Domains") || workbook.worksheets[0];
  if (!domainSheet) return NextResponse.json({ error: "No Domains worksheet found" }, { status: 400 });
  const domainTable = rows(domainSheet, "domain");
  if (!domainTable.headers) return NextResponse.json({ error: "No Domain column was found in the Domains worksheet" }, { status: 400 });

  const domainRows = domainTable.rows.filter((values) => {
    const name = text(cell(values, domainTable.headers!, "Domain")).toLowerCase();
    return name.includes(".") && !name.includes("total");
  });
  if (!domainRows.length) return NextResponse.json({ error: "No domain rows were found to import" }, { status: 400 });

  let importedDomains = 0;
  let importedSubdomains = 0;
  let importedConnections = 0;
  try {
    await transaction(async (client) => {
      const domainIds = new Map<string, string>();
      const connectionIds = new Map<string, string>();

      for (const values of domainRows) {
        const h = domainTable.headers!;
        const name = text(cell(values, h, "Domain")).toLowerCase();
        const connectionName = text(cell(values, h, "Cloudflare Connection", "Cloudflare Connection Name", "Cloudflare Account"));
        const accountHint = text(cell(values, h, "Cloudflare Account Hint", "Cloudflare Email"));
        const token = text(cell(values, h, "Cloudflare API Token", "Cloudflare Token", "API Token"));
        let connectionId: string | null = null;
        const connectionKey = normalize(connectionName || (token ? "Cloudflare" : ""));
        if (connectionKey) {
          connectionId = connectionIds.get(connectionKey) || null;
          if (!connectionId) {
            const existing = await client.query<{ id: string }>("SELECT id FROM cloudflare_connections WHERE lower(name)=lower($1) LIMIT 1", [connectionName || "Cloudflare"]);
            connectionId = existing.rows[0]?.id || null;
            if (connectionId && token) {
              await client.query("UPDATE cloudflare_connections SET token_encrypted=$2,account_hint=COALESCE($3,account_hint),updated_at=now() WHERE id=$1", [connectionId, encryptSecret(token), accountHint || null]);
            } else if (!connectionId && token) {
              const created = await client.query<{ id: string }>("INSERT INTO cloudflare_connections (name,account_hint,token_encrypted) VALUES ($1,$2,$3) RETURNING id", [connectionName || "Cloudflare", accountHint || null, encryptSecret(token)]);
              connectionId = created.rows[0].id;
              importedConnections += 1;
            }
            if (connectionId) connectionIds.set(connectionKey, connectionId);
          }
        }

        const renewalPrice = number(cell(values, h, "Renewal Price", "Price Renewal"));
        const freeTier = boolean(cell(values, h, "Free Tier", "Free Domain")) ?? renewalPrice == null;
        const result = await client.query<{ id: string }>(`INSERT INTO domains
          (name,tld,provider,current_price,registered_at,last_renewed_at,expires_at,renewal_price,currency,hosting,dns_provider,free_tier,notes,cloudflare_connection_id)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
          ON CONFLICT (name) DO UPDATE SET tld=EXCLUDED.tld,provider=EXCLUDED.provider,current_price=EXCLUDED.current_price,
          registered_at=EXCLUDED.registered_at,last_renewed_at=EXCLUDED.last_renewed_at,expires_at=EXCLUDED.expires_at,
          renewal_price=EXCLUDED.renewal_price,currency=EXCLUDED.currency,hosting=EXCLUDED.hosting,dns_provider=EXCLUDED.dns_provider,
          free_tier=EXCLUDED.free_tier,notes=EXCLUDED.notes,cloudflare_connection_id=COALESCE(EXCLUDED.cloudflare_connection_id,domains.cloudflare_connection_id),updated_at=now()
          RETURNING id`, [name, text(cell(values, h, "TLD")) || name.split(".").slice(1).join("."), text(cell(values, h, "Provider")) || null,
          number(cell(values, h, "Current Price", "Price Current")), date(cell(values, h, "Registered", "Registration Date", "Reg Date")),
          date(cell(values, h, "Last Renewed", "Last Renewal Date")), date(cell(values, h, "Expires", "Expiry Date", "Exp Date", "Next Exp Date")),
          renewalPrice, text(cell(values, h, "Currency")) || "INR", text(cell(values, h, "Hosting", "Host")) || null,
          text(cell(values, h, "DNS Provider")) || null, freeTier, text(cell(values, h, "Notes")) || null, connectionId]);
        domainIds.set(name, result.rows[0].id);
        importedDomains += 1;
      }

      const subdomainSheet = workbook.getWorksheet("Subdomains");
      if (subdomainSheet) {
        const subdomainTable = rows(subdomainSheet, "subdomain");
        if (subdomainTable.headers) {
          for (const values of subdomainTable.rows) {
            const h = subdomainTable.headers;
            const domainName = text(cell(values, h, "Domain")).toLowerCase();
            const name = text(cell(values, h, "Subdomain")).toLowerCase();
            if (!domainName || !name.includes(".")) continue;
            let domainId = domainIds.get(domainName);
            if (!domainId) domainId = (await client.query<{ id: string }>("SELECT id FROM domains WHERE name=$1", [domainName])).rows[0]?.id;
            if (!domainId) continue;
            await client.query(`INSERT INTO subdomains (domain_id,name,dns_name,record_type,service,host,path,ipv4,proxied,source,notes)
              VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
              ON CONFLICT (domain_id,name) DO UPDATE SET dns_name=EXCLUDED.dns_name,record_type=EXCLUDED.record_type,service=EXCLUDED.service,
              host=EXCLUDED.host,path=EXCLUDED.path,ipv4=EXCLUDED.ipv4,proxied=EXCLUDED.proxied,source=EXCLUDED.source,notes=EXCLUDED.notes,updated_at=now()`,
              [domainId, name, text(cell(values, h, "DNS Name")) || null, text(cell(values, h, "Record Type", "Type")) || null,
                text(cell(values, h, "Service")) || null, text(cell(values, h, "Host")) || null, text(cell(values, h, "Path Proxy", "Path / Proxy", "Path", "Target")) || null,
                text(cell(values, h, "IPv4", "IP Address")) || null, boolean(cell(values, h, "Proxied")), text(cell(values, h, "Source")) || "excel", text(cell(values, h, "Notes")) || null]);
            importedSubdomains += 1;
          }
        }
      }
    });
  } catch (error) {
    console.error("Domain import failed", error);
    return NextResponse.json({ error: error instanceof Error ? `Import failed: ${error.message}` : "Import failed" }, { status: 400 });
  }

  await audit(user.id, "domain.import", "domain", undefined, { importedDomains, importedSubdomains, importedConnections, filename: file.name });
  return NextResponse.json({ imported: importedDomains, importedDomains, importedSubdomains, importedConnections });
}
