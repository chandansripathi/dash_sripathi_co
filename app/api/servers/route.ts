import { mutateStore, readServers } from "../../../lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function toPublicServer(server: Awaited<ReturnType<typeof readServers>>[number]) {
  const metric = server.metrics.at(-1);
  return {
    id: server.id,
    agentId: server.agentId,
    name: server.name,
    ip: server.ip,
    location: server.location,
    os: server.os,
    lastSeenAt: server.lastSeenAt,
    cpu: metric?.cpu ?? 0,
    ram: metric?.ram ?? 0,
    temperature: metric?.temperature ?? 0,
    uptimeSeconds: metric?.uptimeSeconds ?? 0,
    load1: metric?.load1 ?? null,
    recordedAt: metric?.recordedAt ?? null,
  };
}

export async function GET() {
  const servers = (await readServers()).map(toPublicServer).sort((a, b) => a.name.localeCompare(b.name));
  return Response.json({ servers }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const body = await request.json() as { name?: string; ip?: string; location?: string; os?: string };
  if (!body.name?.trim() || !body.ip?.trim()) return Response.json({ error: "name and ip are required" }, { status: 400 });

  const server = await mutateStore((store) => {
    const now = Date.now();
    const created = {
      id: store.nextServerId++,
      agentId: crypto.randomUUID(),
      name: body.name!.trim(),
      ip: body.ip!.trim(),
      location: body.location?.trim() || "Unknown",
      os: body.os?.trim() || "Linux",
      createdAt: now,
      lastSeenAt: null,
      metrics: [],
    };
    store.servers.push(created);
    return created;
  });
  return Response.json({ server: toPublicServer(server) }, { status: 201 });
}
