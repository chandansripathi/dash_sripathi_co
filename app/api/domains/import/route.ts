import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { audit, requireUser } from "@/lib/auth";
import { transaction } from "@/lib/db";

function text(value: ExcelJS.CellValue) {
  if (value == null) return "";
  if (typeof value === "object" && "text" in value) return String(value.text);
  if (typeof value === "object" && "result" in value) return String(value.result ?? "");
  return String(value).trim();
}
function date(value: ExcelJS.CellValue) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "number") return new Date(Math.round((value - 25569) * 86400000)).toISOString().slice(0, 10);
  const raw = text(value);
  const match = raw.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  return match ? `${match[3]}-${match[2].padStart(2,"0")}-${match[1].padStart(2,"0")}` : raw || null;
}
function number(value: ExcelJS.CellValue) {
  const parsed = Number(text(value).replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

export async function POST(request: Request) {
  const user = await requireUser(["admin", "operator"]);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const file = (await request.formData()).get("file");
  if (!(file instanceof File) || file.size > 25 * 1024 * 1024) return NextResponse.json({ error: "Choose an Excel file under 25 MB" }, { status: 400 });
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Buffer.from(await file.arrayBuffer()) as never);
  const sheet = workbook.getWorksheet("Domains") || workbook.worksheets[0];
  if (!sheet) return NextResponse.json({ error: "No worksheet found" }, { status: 400 });
  let headers: Record<string, number> = {};
  let imported = 0;
  await transaction(async (client) => {
    const pending: Array<Promise<unknown>> = [];
    sheet.eachRow((row) => {
      const values = row.values as ExcelJS.CellValue[];
      const labels = values.map((value) => text(value).toLowerCase());
      const domainColumn = labels.findIndex((label) => label === "domain");
      if (domainColumn > 0) {
        headers = Object.fromEntries(labels.map((label, index) => [label, index]));
        return;
      }
      if (!headers.domain) return;
      const name = text(values[headers.domain]).toLowerCase();
      if (!name.includes(".") || name.includes("total")) return;
      const get = (...names: string[]) => values[names.map((item) => headers[item]).find(Boolean) || 0];
      pending.push(client.query(`INSERT INTO domains (name,tld,provider,current_price,registered_at,last_renewed_at,expires_at,renewal_price,hosting,dns_provider,free_tier)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT (name) DO UPDATE SET provider=EXCLUDED.provider,
        current_price=EXCLUDED.current_price,registered_at=EXCLUDED.registered_at,last_renewed_at=EXCLUDED.last_renewed_at,
        expires_at=EXCLUDED.expires_at,renewal_price=EXCLUDED.renewal_price,hosting=EXCLUDED.hosting,dns_provider=EXCLUDED.dns_provider,updated_at=now()`,
        [name, text(get("tld")) || name.split(".").slice(1).join("."), text(get("provider")) || null, number(get("price (current)")),
          date(get("reg date")), date(get("last renewal date")), date(get("exp date", "next exp date")), number(get("price (renewal)")),
          text(get("host")) || null, text(get("dns provider")) || null, number(get("price (renewal)")) == null]));
      imported += 1;
    });
    await Promise.all(pending);
  });
  await audit(user.id, "domain.import", "domain", undefined, { imported, filename: file.name });
  return NextResponse.json({ imported });
}
