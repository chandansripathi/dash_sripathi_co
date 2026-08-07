import { decryptSecret } from "./crypto";
import { query } from "./db";

type CloudflareEnvelope<T> = { success: boolean; errors?: Array<{ message: string }>; result: T; result_info?: { total_pages: number } };

export async function cloudflareRequest<T>(connectionId: string, path: string) {
  const connection = await query<{ token_encrypted: string }>("SELECT token_encrypted FROM cloudflare_connections WHERE id=$1", [connectionId]);
  if (!connection.rows[0]) throw new Error("Cloudflare connection not found");
  const response = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    headers: { Authorization: `Bearer ${decryptSecret(connection.rows[0].token_encrypted)}`, "Content-Type": "application/json" },
    cache: "no-store",
  });
  const payload = await response.json() as CloudflareEnvelope<T>;
  if (!response.ok || !payload.success) throw new Error(payload.errors?.[0]?.message || "Cloudflare request failed");
  return payload.result;
}

export type CloudflareZone = { id: string; name: string; status: string; account?: { id: string; name: string } };
export type CloudflareRecord = { id: string; type: string; name: string; content: string; proxied?: boolean; ttl: number; comment?: string };
