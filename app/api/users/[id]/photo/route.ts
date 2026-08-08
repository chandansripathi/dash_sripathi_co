import { NextResponse } from "next/server";
import { audit, requireUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { saveImage } from "@/lib/upload";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await requireUser(["admin"]);
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  try {
    const path = await saveImage((await request.formData()).get("file"), "avatar");
    await query("UPDATE users SET avatar_path=$2,updated_at=now() WHERE id=$1", [id, path]);
    await audit(actor.id, "user.photo", "user", id);
    return NextResponse.json({ path });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Upload failed" }, { status: 400 });
  }
}
