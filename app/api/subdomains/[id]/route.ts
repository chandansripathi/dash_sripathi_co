import { NextResponse } from "next/server";
import { audit, requireUser } from "@/lib/auth";
import { query } from "@/lib/db";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser(["admin", "operator"]);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const b = await request.json();
  await query(`UPDATE subdomains SET name=COALESCE(lower($2),name),dns_name=$3,record_type=$4,service=$5,host=$6,path=$7,ipv4=$8,
    proxied=$9,notes=$10,updated_at=now() WHERE id=$1`, [id, b.name || null, b.dnsName || null, b.recordType || null,
    b.service || null, b.host || null, b.path || null, b.ipv4 || null, typeof b.proxied === "boolean" ? b.proxied : null, b.notes || null]);
  await audit(user.id, "subdomain.update", "subdomain", id);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser(["admin", "operator"]);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  await query("DELETE FROM subdomains WHERE id=$1", [id]);
  await audit(user.id, "subdomain.delete", "subdomain", id);
  return NextResponse.json({ ok: true });
}
