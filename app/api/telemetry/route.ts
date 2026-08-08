import { NextResponse } from "next/server";
import { hashToken } from "@/lib/crypto";
import { query } from "@/lib/db";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  const b = await request.json();
  const server = await query<{ id: string; refresh_interval_ms: number }>("SELECT id,refresh_interval_ms FROM servers WHERE agent_id=$1 AND agent_token_hash=$2 AND active=true", [b.agentId, hashToken(token)]);
  if (!server.rows[0]) return NextResponse.json({ error: "Unauthorized agent" }, { status: 401 });
  const id = server.rows[0].id;
  await query(`UPDATE servers SET ipv4=COALESCE($2,ipv4),wan_ipv4=COALESCE($3,wan_ipv4),os=COALESCE($4,os),agent_version=$5,last_seen_at=now(),updated_at=now() WHERE id=$1`,
    [id, b.ipv4 || null, b.wanIpv4 || null, b.os || null, b.agentVersion || null]);
  await query(`INSERT INTO server_metrics (server_id,cpu,ram,temperature,uptime_seconds,load1,disks,network,proxies)
    VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9::jsonb)`, [id, Number(b.cpu || 0), Number(b.ram || 0),
    b.temperature == null ? null : Number(b.temperature), Number(b.uptimeSeconds || 0), b.load1 == null ? null : Number(b.load1),
    JSON.stringify(b.disks || []), JSON.stringify(b.network || {}), JSON.stringify(b.proxies || [])]);
  await query("DELETE FROM server_metrics WHERE server_id=$1 AND recorded_at < now()-interval '30 days'", [id]);
  return NextResponse.json({ ok: true, serverId: id, intervalMs: server.rows[0].refresh_interval_ms });
}
