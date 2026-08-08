import { NextResponse } from "next/server";
import { audit, requireUser } from "@/lib/auth";
import { hashToken, randomToken } from "@/lib/crypto";
import { query } from "@/lib/db";

export async function GET() {
  if (!await requireUser()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const result = await query(`SELECT s.id,s.agent_id,s.name,s.location,s.os,s.ipv4,s.wan_ipv4,s.last_seen_at,s.enrolled_at,s.active,s.icon_path,s.refresh_interval_ms,
    m.cpu,m.ram,m.temperature,m.uptime_seconds,m.load1,m.disks,m.network,m.proxies,m.recorded_at
    FROM servers s LEFT JOIN LATERAL (SELECT * FROM server_metrics WHERE server_id=s.id ORDER BY recorded_at DESC LIMIT 1) m ON true
    ORDER BY s.name`);
  return NextResponse.json({ servers: result.rows });
}

export async function POST(request: Request) {
  const user = await requireUser(["admin", "operator"]);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const b = await request.json();
  const enrollmentToken = randomToken(24);
  const result = await query<{ id: string; agent_id: string }>(`INSERT INTO servers
    (name,location,os,ipv4,enrollment_token_hash,enrollment_expires_at) VALUES ($1,$2,$3,$4,$5,now()+interval '24 hours') RETURNING id,agent_id`,
    [b.name, b.location || null, b.os || null, b.ipv4 || b.ip || null, hashToken(enrollmentToken)]);
  await audit(user.id, "server.create", "server", result.rows[0].id);
  return NextResponse.json({ ...result.rows[0], enrollmentToken, installCommand: installCommand(result.rows[0].agent_id, enrollmentToken) }, { status: 201 });
}

function installCommand(agentId: string, token: string) {
  const base = (process.env.NEXUS_PUBLIC_URL || "https://dash.sripathi.co").replace(/\/$/, "");
  return `curl -fsSL ${base}/api/agent/install | sudo bash -s -- --url ${base} --agent-id ${agentId} --token ${token}`;
}
