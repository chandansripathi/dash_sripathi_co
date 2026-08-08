import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";

const allowed = new Set(["image/png", "image/jpeg", "image/webp", "image/svg+xml", "image/x-icon", "image/vnd.microsoft.icon"]);

export async function saveImage(file: FormDataEntryValue | null, prefix: string) {
  if (!(file instanceof File) || !allowed.has(file.type) || file.size > 5 * 1024 * 1024) {
    throw new Error("Choose a PNG, JPG, WebP, SVG, or ICO image under 5 MB");
  }
  const extension = extname(file.name).toLowerCase().replace(/[^.a-z0-9]/g, "") || ".img";
  const filename = `${prefix}-${randomUUID()}${extension}`;
  const dir = join(process.env.NEXUS_DATA_DIR || "/data", "uploads");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, filename), Buffer.from(await file.arrayBuffer()), { mode: 0o600 });
  return `/api/assets/${filename}`;
}
