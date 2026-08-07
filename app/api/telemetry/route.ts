import { timingSafeEqual } from "node:crypto";
import { mutateStore } from "../../../lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(request: Request) {
  const expected = process.env.NEXUS_AGENT_TOKEN ?? "";
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const left = Buffer.from(expected);
  const right = Buffer.from(supplied);
  return left.length > 0 && left.length === right.length && timingSafeEqual(left, right);
}

export async function POST(request: Request) {
  if (!authorized(request)) return Response.json({ error: "Unauthorized agent" }, { status: 401 });

  const body = await request.json() as {
    agentId?: string; name?: string; ip?: string; location?: string; os?: string;
    cpu?: number; ram?: number; temperature?: number; uptimeSeconds?: number; load1?: number;
  };
  if (!body.agentId?.trim() || !body.name?.trim() || !body.ip?.trim()) {
    return Response.json({ error: "agentId, name and ip are required" }, { status: 400 });
  }

  const serverId = await mutateStore((store) => {
    const now = Date.now();
    let server = store.servers.find((item) => item.agentId === body.agentId);
    if (!server) {
      server = {
        id: store.nextServerId++, agentId: body.agentId!.trim(), name: body.name!.trim(), ip: body.ip!.trim(),
        location: body.location?.trim() || "Unknown", os: body.os?.trim() || "Linux", createdAt: now,
        lastSeenAt: now, metrics: [],
      };
      store.servers.push(server);
    }
    server.name = body.name!.trim();
    server.ip = body.ip!.trim();
    server.location = body.location?.trim() || server.location;
    server.os = body.os?.trim() || server.os;
    server.lastSeenAt = now;
    server.metrics.push({
      cpu: Math.min(100, Math.max(0, Number(body.cpu) || 0)),
      ram: Math.min(100, Math.max(0, Number(body.ram) || 0)),
      temperature: Math.max(0, Number(body.temperature) || 0),
      uptimeSeconds: Math.max(0, Math.round(Number(body.uptimeSeconds) || 0)),
      load1: Number.isFinite(body.load1) ? Number(body.load1) : null,
      recordedAt: now,
    });
    server.metrics = server.metrics.slice(-1440);
    return server.id;
  });
  return Response.json({ ok: true, serverId });
}
