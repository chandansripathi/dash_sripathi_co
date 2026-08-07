import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { audit, requireUser } from "@/lib/auth";
import { query } from "@/lib/db";

export async function GET() {
  const result = await query("SELECT * FROM branding WHERE id=1");
  return NextResponse.json({ branding: result.rows[0] });
}

export async function PATCH(request: Request) {
  const user = await requireUser(["admin"]);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const b = await request.json();
  const size = Math.min(20, Math.max(12, Number(b.baseFontSize || 15)));
  await query(`UPDATE branding SET brand_name=COALESCE($1,brand_name),brand_tagline=COALESCE($2,brand_tagline),
    primary_color=COALESCE($3,primary_color),accent_color=COALESCE($4,accent_color),font_family=COALESCE($5,font_family),
    base_font_size=$6,updated_at=now() WHERE id=1`, [b.brandName || null, b.brandTagline || null, b.primaryColor || null,
    b.accentColor || null, b.fontFamily || null, size]);
  await audit(user.id, "branding.update", "branding", "1");
  return NextResponse.json({ ok: true });
}

export async function POST(request: Request) {
  const user = await requireUser(["admin"]);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const form = await request.formData();
  const kind = String(form.get("kind") || "");
  const file = form.get("file");
  const columns: Record<string, string> = { logo: "logo_path", loginLogo: "login_logo_path", favicon: "favicon_path", loginBackground: "login_background_path" };
  if (!(file instanceof File) || !columns[kind] || !["image/png","image/jpeg","image/webp","image/svg+xml","image/x-icon"].includes(file.type) || file.size > 5 * 1024 * 1024) {
    return NextResponse.json({ error: "Choose a PNG, JPG, WebP, SVG, or ICO image under 5 MB" }, { status: 400 });
  }
  const extension = extname(file.name).toLowerCase().replace(/[^.a-z0-9]/g, "") || ".img";
  const filename = `${kind}-${randomUUID()}${extension}`;
  const dir = join(process.env.NEXUS_DATA_DIR || "/data", "uploads");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, filename), Buffer.from(await file.arrayBuffer()), { mode: 0o600 });
  const assetPath = `/api/assets/${filename}`;
  await query(`UPDATE branding SET ${columns[kind]}=$1,updated_at=now() WHERE id=1`, [assetPath]);
  await audit(user.id, "branding.upload", "branding", "1", { kind });
  return NextResponse.json({ path: assetPath });
}
