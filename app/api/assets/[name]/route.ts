import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";

const types: Record<string, string> = { ".png":"image/png", ".jpg":"image/jpeg", ".jpeg":"image/jpeg", ".webp":"image/webp", ".svg":"image/svg+xml", ".ico":"image/x-icon" };
export async function GET(_: Request, { params }: { params: Promise<{ name: string }> }) {
  try {
    const name = basename((await params).name);
    const file = await readFile(join(process.env.NEXUS_DATA_DIR || "/data", "uploads", name));
    return new NextResponse(file, { headers: { "content-type": types[extname(name).toLowerCase()] || "application/octet-stream", "cache-control": "public,max-age=86400" } });
  } catch { return new NextResponse("Not found", { status: 404 }); }
}
