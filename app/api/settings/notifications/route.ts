import { NextResponse } from "next/server";
import { audit, requireUser } from "@/lib/auth";
import { query } from "@/lib/db";

export async function GET() {
  if (!await requireUser(["admin"])) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const result = await query("SELECT * FROM notification_settings WHERE id=1");
  return NextResponse.json({ settings: result.rows[0], smtpConfigured: Boolean(process.env.SMTP_HOST && process.env.SMTP_FROM) });
}

export async function PATCH(request: Request) {
  const user = await requireUser(["admin"]);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const b = await request.json();
  await query(`UPDATE notification_settings SET email_to=$1,webhook_url=$2,offline_minutes=$3,renewal_days=$4,updated_at=now() WHERE id=1`,
    [b.emailTo || null, b.webhookUrl || null, Math.max(1, Number(b.offlineMinutes || 3)), Math.max(1, Number(b.renewalDays || 60))]);
  await audit(user.id, "notifications.update", "notification_settings", "1");
  return NextResponse.json({ ok: true });
}
