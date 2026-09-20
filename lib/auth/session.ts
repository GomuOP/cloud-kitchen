import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "node:crypto";

// Auth is intentionally minimal for this project — same philosophy as the
// mocked payment provider: it's not one of the "interesting parts" this
// portfolio project is about, so it gets the simplest defensible
// implementation rather than pulling in a full auth library. Customers and
// kitchen owners identify by email only (no password); a single admin
// passcode gates platform moderation. Flagged explicitly in
// docs/design.md as a deliberate scope cut.

function getSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      // Refuse to silently fall back to a hardcoded secret in production —
      // that would make every session cookie forgeable by anyone who's
      // read this file (it's public, it's in the repo).
      throw new Error("SESSION_SECRET must be set in production");
    }
    return "dev-only-insecure-secret-change-me";
  }
  return secret;
}

const MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

function sign(payload: string): string {
  const mac = createHmac("sha256", getSecret()).update(payload).digest("base64url");
  return `${payload}.${mac}`;
}

function verify(token: string): string | null {
  const idx = token.lastIndexOf(".");
  if (idx === -1) return null;
  const payload = token.slice(0, idx);
  const mac = token.slice(idx + 1);
  const expectedMac = createHmac("sha256", getSecret()).update(payload).digest("base64url");
  const macBuf = Buffer.from(mac);
  const expectedBuf = Buffer.from(expectedMac);
  if (macBuf.length !== expectedBuf.length || !timingSafeEqual(macBuf, expectedBuf)) {
    return null;
  }
  return payload;
}

function setSignedCookie(name: string, value: string, jar: Awaited<ReturnType<typeof cookies>>) {
  jar.set(name, sign(value), { httpOnly: true, sameSite: "lax", maxAge: MAX_AGE_SECONDS, path: "/" });
}

const CUSTOMER_COOKIE = "meal_customer_session";
const KITCHEN_COOKIE = "meal_kitchen_session";
const ADMIN_COOKIE = "meal_admin_session";

export async function createCustomerSession(userId: string) {
  const jar = await cookies();
  setSignedCookie(CUSTOMER_COOKIE, userId, jar);
}

export async function getCustomerUserId(): Promise<string | null> {
  const jar = await cookies();
  const token = jar.get(CUSTOMER_COOKIE)?.value;
  return token ? verify(token) : null;
}

export async function clearCustomerSession() {
  const jar = await cookies();
  jar.delete(CUSTOMER_COOKIE);
}

/** Kitchen owner sessions carry the kitchen's id (not a person's id — one email maps to one kitchen). */
export async function createKitchenSession(kitchenId: string) {
  const jar = await cookies();
  setSignedCookie(KITCHEN_COOKIE, kitchenId, jar);
}

export async function getKitchenId(): Promise<string | null> {
  const jar = await cookies();
  const token = jar.get(KITCHEN_COOKIE)?.value;
  return token ? verify(token) : null;
}

export async function clearKitchenSession() {
  const jar = await cookies();
  jar.delete(KITCHEN_COOKIE);
}

export async function createAdminSession() {
  const jar = await cookies();
  setSignedCookie(ADMIN_COOKIE, "admin", jar);
}

export async function isAdmin(): Promise<boolean> {
  const jar = await cookies();
  const token = jar.get(ADMIN_COOKIE)?.value;
  return token ? verify(token) === "admin" : false;
}

export async function clearAdminSession() {
  const jar = await cookies();
  jar.delete(ADMIN_COOKIE);
}
