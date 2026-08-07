import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import { join } from "node:path";

export const runtime = "nodejs";
export async function GET() {
  const script = await fs.readFile(join(process.cwd(), "scripts", "nexus_agent.py"), "utf8");
  return new NextResponse(script, { headers: { "content-type": "text/x-python; charset=utf-8", "cache-control": "no-store" } });
}
