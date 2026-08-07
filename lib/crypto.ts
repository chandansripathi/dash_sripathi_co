import { createCipheriv, createDecipheriv, createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);

export function randomToken(bytes = 32) {
  return randomBytes(bytes).toString("base64url");
}

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const derived = await scrypt(password, salt, 64) as Buffer;
  return `scrypt:${salt.toString("base64")}:${derived.toString("base64")}`;
}

export async function verifyPassword(password: string, encoded: string) {
  const [algorithm, salt64, hash64] = encoded.split(":");
  if (algorithm !== "scrypt" || !salt64 || !hash64) return false;
  const expected = Buffer.from(hash64, "base64");
  const actual = await scrypt(password, Buffer.from(salt64, "base64"), expected.length) as Buffer;
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function encryptionKey() {
  const secret = process.env.NEXUS_ENCRYPTION_KEY;
  if (!secret) throw new Error("NEXUS_ENCRYPTION_KEY is required");
  return createHash("sha256").update(secret).digest();
}

export function encryptSecret(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString("base64url")).join(".");
}

export function decryptSecret(value: string) {
  const [iv64, tag64, data64] = value.split(".");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(iv64, "base64url"));
  decipher.setAuthTag(Buffer.from(tag64, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(data64, "base64url")), decipher.final()]).toString("utf8");
}
