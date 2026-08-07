import { NextResponse } from "next/server";
import { audit, requireUser } from "@/lib/auth";
import { hashToken, randomToken } from "@/lib/crypto";
import { query } from "@/lib/db";

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
  await query("UPDATE servers SET name=COALESCE($2,name),location=$3,os=$4,ipv4=$5,active=COALESCE($6,active),updated_at=now() WHERE id=$1",
    [id, b.name || null, b.location || null, b.os || null, b.ipv4 || null, typeof b.active === "boolean" ? b.active : null]);
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
