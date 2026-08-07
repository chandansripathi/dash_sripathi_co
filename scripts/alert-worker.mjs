import nodemailer from "nodemailer";
import pg from "pg";

const { Client } = pg;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function notify(settings, alert) {
  const jobs = [];
  if (settings.email_to && process.env.SMTP_HOST && process.env.SMTP_FROM) {
    const transport = nodemailer.createTransport({ host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT || 587), secure: process.env.SMTP_SECURE === "true",
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined });
    jobs.push(transport.sendMail({ from: process.env.SMTP_FROM, to: settings.email_to, subject: `[Nexus] ${alert.title}`, text: `${alert.message}\n\nOpen ${process.env.NEXUS_PUBLIC_URL || "your Nexus dashboard"}` }));
  }
  if (settings.webhook_url) jobs.push(fetch(settings.webhook_url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: alert.title, text: alert.message, severity: alert.severity, nexusUrl: process.env.NEXUS_PUBLIC_URL }) }));
  await Promise.allSettled(jobs);
}

async function run() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const settings = (await client.query("SELECT * FROM notification_settings WHERE id=1")).rows[0];
  const offline = await client.query(`SELECT id,name,last_seen_at FROM servers WHERE active=true AND (last_seen_at IS NULL OR last_seen_at < now()-($1||' minutes')::interval)`, [settings.offline_minutes]);
  for (const server of offline.rows) {
    const inserted = await client.query(`INSERT INTO alerts (type,severity,title,message,entity_type,entity_id,dedupe_key)
      VALUES ('server_offline','critical',$1,$2,'server',$3,$4) ON CONFLICT DO NOTHING RETURNING *`,
      [`${server.name} is offline`, `No telemetry has arrived for more than ${settings.offline_minutes} minutes.`, server.id, `server-offline:${server.id}`]);
    if (inserted.rows[0]) { await notify(settings, inserted.rows[0]); await client.query("UPDATE alerts SET notified_at=now() WHERE id=$1", [inserted.rows[0].id]); }
  }
  await client.query(`UPDATE alerts a SET resolved_at=now() FROM servers s WHERE a.dedupe_key='server-offline:'||s.id AND a.resolved_at IS NULL
    AND s.last_seen_at >= now()-($1||' minutes')::interval`, [settings.offline_minutes]);
  const renewals = await client.query(`SELECT id,name,expires_at,(expires_at-current_date) AS days FROM domains WHERE expires_at IS NOT NULL AND expires_at-current_date BETWEEN 0 AND $1`, [settings.renewal_days]);
  for (const domain of renewals.rows) {
    const inserted = await client.query(`INSERT INTO alerts (type,severity,title,message,entity_type,entity_id,dedupe_key)
      VALUES ('domain_renewal','warning',$1,$2,'domain',$3,$4) ON CONFLICT DO NOTHING RETURNING *`,
      [`${domain.name} renews soon`, `${domain.name} expires in ${domain.days} days on ${domain.expires_at.toISOString().slice(0,10)}.`, domain.id, `domain-renewal:${domain.id}:${domain.expires_at.toISOString().slice(0,10)}`]);
    if (inserted.rows[0]) { await notify(settings, inserted.rows[0]); await client.query("UPDATE alerts SET notified_at=now() WHERE id=$1", [inserted.rows[0].id]); }
  }
  await client.end();
}

while (true) {
  try { await run(); } catch (error) { console.error("Nexus alert worker:", error); }
  await sleep(60000);
}
