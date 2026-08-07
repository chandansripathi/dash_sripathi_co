import { cookies } from "next/headers";
import { query } from "./db";
import { hashToken, randomToken } from "./crypto";

export const SESSION_COOKIE = "nexus_session";

export type SessionUser = { id: string; name: string; email: string; role: "admin" | "operator" | "viewer" };

export async function createSession(userId: string) {
  const token = randomToken();
  await query("INSERT INTO sessions (user_id, token_hash, expires_at) VALUES ($1,$2,now()+interval '30 days')", [userId, hashToken(token)]);
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, { httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 30 });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await query("DELETE FROM sessions WHERE token_hash=$1", [hashToken(token)]);
  jar.delete(SESSION_COOKIE);
}

export async function getUser(): Promise<SessionUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const result = await query<SessionUser>(`SELECT u.id,u.name,u.email,u.role FROM sessions s JOIN users u ON u.id=s.user_id
    WHERE s.token_hash=$1 AND s.expires_at>now() AND u.active=true`, [hashToken(token)]);
  return result.rows[0] || null;
}

export async function requireUser(roles?: SessionUser["role"][]) {
  const user = await getUser();
  if (!user || (roles && !roles.includes(user.role))) return null;
  return user;
}

export async function audit(userId: string | null, action: string, entityType?: string, entityId?: string, details: unknown = {}) {
  await query("INSERT INTO audit_logs (user_id,action,entity_type,entity_id,details) VALUES ($1,$2,$3,$4,$5::jsonb)", [userId, action, entityType || null, entityId || null, JSON.stringify(details)]);
}
