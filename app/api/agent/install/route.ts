import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import { join } from "node:path";

export const runtime = "nodejs";

export async function GET() {
  const template = await fs.readFile(join(process.cwd(), "scripts", "install-agent.sh"), "utf8");
  return new NextResponse(template, { headers: { "content-type": "text/x-shellscript; charset=utf-8", "cache-control": "no-store" } });
}
