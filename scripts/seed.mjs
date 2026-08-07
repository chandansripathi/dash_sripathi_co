import fs from "node:fs/promises";
import pg from "pg";

const { Client } = pg;
const client = new Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

const count = Number((await client.query("SELECT count(*) AS count FROM domains")).rows[0].count);
if (count === 0) {
  const seed = JSON.parse(await fs.readFile(new URL("../seed/seed-domains.json", import.meta.url), "utf8"));
  await client.query("BEGIN");
  try {
    for (const domain of seed.domains) {
      await client.query(`INSERT INTO domains
        (name,tld,provider,current_price,registered_at,last_renewed_at,expires_at,renewal_price,hosting,dns_provider,free_tier)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT (name) DO NOTHING`,
        [domain.name, domain.tld, domain.provider, domain.currentPrice, domain.registeredAt, domain.lastRenewedAt,
          domain.expiresAt, domain.renewalPrice, domain.hosting, domain.dnsProvider, domain.freeTier]);
    }
    for (const item of seed.subdomains) {
      await client.query(`INSERT INTO subdomains (domain_id,name,dns_name,service,host,path,ipv4,source)
        SELECT id,$2,$3,$4,$5,$6,$7,$8 FROM domains WHERE name=$1
        ON CONFLICT (domain_id,name) DO NOTHING`, [item.domain, item.name, item.dnsName, item.service, item.host, item.path, item.ipv4, item.source]);
    }
    await client.query("COMMIT");
    console.log(`Seeded ${seed.domains.length} domains and ${seed.subdomains.length} subdomains.`);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

try {
  const legacy = JSON.parse(await fs.readFile("/data/nexus.json", "utf8"));
  for (const server of legacy.servers || []) {
    await client.query(`INSERT INTO servers (name,location,os,ipv4,last_seen_at,agent_id)
      SELECT $1,$2,$3,$4,to_timestamp($5/1000.0),gen_random_uuid()
      WHERE NOT EXISTS (SELECT 1 FROM servers WHERE name=$1 AND ipv4 IS NOT DISTINCT FROM $4)`,
      [server.name, server.location, server.os, server.ip, server.lastSeenAt || null]);
  }
} catch {}

await client.end();
