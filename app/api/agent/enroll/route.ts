import { NextResponse } from "next/server";
import { hashToken, randomToken } from "@/lib/crypto";
import { query } from "@/lib/db";

export async function POST(request: Request) {
  const b = await request.json();
  const result = await query<{ id: string }>(`SELECT id FROM servers WHERE agent_id=$1 AND enrollment_token_hash=$2
    AND enrollment_expires_at>now() AND active=true`, [b.agentId, hashToken(String(b.token || ""))]);
  if (!result.rows[0]) return NextResponse.json({ error: "Invalid or expired enrollment" }, { status: 401 });
  const agentToken = randomToken(32);
  await query("UPDATE servers SET agent_token_hash=$2,enrollment_token_hash=NULL,enrollment_expires_at=NULL,enrolled_at=now() WHERE id=$1", [result.rows[0].id, hashToken(agentToken)]);
  return NextResponse.json({ agentToken });
}
