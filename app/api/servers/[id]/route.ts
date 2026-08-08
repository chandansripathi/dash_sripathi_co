import { NextResponse } from "next/server";
import { audit, requireUser } from "@/lib/auth";
import { hashToken, randomToken } from "@/lib/crypto";
import { query } from "@/lib/db";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!await requireUser()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const [server, metrics] = await Promise.all([
    query("SELECT id,agent_id,name,location,os,ipv4,wan_ipv4,last_seen_at,enrolled_at,active,icon_path,refresh_interval_ms,agent_version FROM servers WHERE id=$1", [id]),
    query("SELECT cpu,ram,temperature,uptime_seconds,load1,disks,network,proxies,recorded_at FROM server_metrics WHERE server_id=$1 ORDER BY recorded_at DESC LIMIT 120", [id]),
  ]);
  if (!server.rows[0]) return NextResponse.json({ error: "Server not found" }, { status: 404 });
  return NextResponse.json({ server: { ...server.rows[0], ...(metrics.rows[0] || {}) }, metrics: metrics.rows.reverse() });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser(["admin", "operator"]);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const b = await request.json();
  if (b.rotateEnrollment) {
    const token = randomToken(24);
    const result = await query<{ agent_id: string }>(`UPDATE servers SET enrollment_token_hash=$2,enrollment_expires_at=now()+interval '24 hours',
      agent_token_hash=NULL,enrolled_at=NULL,updated_at=now() WHERE id=$1 RETURNING agent_id`, [id, hashToken(token)]);
    const base = (process.env.NEXUS_PUBLIC_URL || "https://dash.sripathi.co").replace(/\/$/, "");
    await audit(user.id, "server.rotate_enrollment", "server", id);
    return NextResponse.json({ enrollmentToken: token, installCommand: `curl -fsSL ${base}/api/agent/install | sudo bash -s -- --url ${base} --agent-id ${result.rows[0].agent_id} --token ${token}` });
  }
  const refreshMs = b.refreshIntervalMs == null ? null : Math.min(300000, Math.max(1000, Number(b.refreshIntervalMs)));
  await query("UPDATE servers SET name=COALESCE($2,name),location=$3,os=$4,ipv4=$5,active=COALESCE($6,active),refresh_interval_ms=COALESCE($7,refresh_interval_ms),updated_at=now() WHERE id=$1",
    [id, b.name || null, b.location || null, b.os || null, b.ipv4 || null, typeof b.active === "boolean" ? b.active : null, refreshMs]);
  await audit(user.id, "server.update", "server", id);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser(["admin"]);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  await query("DELETE FROM servers WHERE id=$1", [id]);
  await audit(user.id, "server.delete", "server", id);
  return NextResponse.json({ ok: true });
}
