import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

// Same "no auth library" philosophy as the hand-rolled HMAC session signing
// in session.ts — scrypt already ships in node:crypto, so password hashing
// needs no new dependency. Format: "<salt-hex>:<hash-hex>".

const KEY_LENGTH = 64;

export const MIN_PASSWORD_LENGTH = 8;

export function hashPassword(plain: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(plain, salt, KEY_LENGTH).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(plain: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;

  const hashBuf = Buffer.from(hash, "hex");
  const candidateBuf = scryptSync(plain, salt, KEY_LENGTH);
  if (hashBuf.length !== candidateBuf.length) return false;
  return timingSafeEqual(hashBuf, candidateBuf);
}
