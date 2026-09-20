"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/client";
import { Prisma } from "@/lib/generated/prisma/client";
import { createKitchenSession, clearKitchenSession, getKitchenId } from "@/lib/auth/session";
import { hashPassword, verifyPassword, MIN_PASSWORD_LENGTH } from "@/lib/auth/password";
import { registerKitchen } from "@/lib/domain/kitchen/actions";

export type FormActionState = { error?: string };

// Returns { error } instead of throwing for expected validation failures —
// Next.js redacts custom Error messages thrown from Server Actions in
// production builds, so a thrown Error here would reach the client as an
// opaque generic message. Paired with useActionState on the client (see
// KitchenLoginForm/KitchenRegisterForm), which is the pattern React/Next
// actually designed for this. See docs/design.md.

// Generic error message on failure (unknown email or wrong password) —
// doesn't reveal which one was wrong, same principle as loginCustomer in
// app/actions/customer.ts.
export async function loginKitchenOwner(_prevState: FormActionState, formData: FormData): Promise<FormActionState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  const kitchen = await prisma.kitchen.findUnique({ where: { email } });
  if (!kitchen || !verifyPassword(password, kitchen.passwordHash)) {
    return { error: "Invalid email or password." };
  }
  await createKitchenSession(kitchen.id);
  redirect("/kitchen");
}

export async function registerKitchenAction(_prevState: FormActionState, formData: FormData): Promise<FormActionState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  if (password.length < MIN_PASSWORD_LENGTH) {
    return { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` };
  }
  if (password !== confirmPassword) {
    return { error: "Passwords don't match." };
  }

  const existing = await prisma.kitchen.findUnique({ where: { email } });
  if (existing) {
    return { error: "A kitchen is already registered with that email — try logging in instead." };
  }

  const kitchen = await registerKitchen({
    ownerName: String(formData.get("ownerName")),
    email,
    passwordHash: hashPassword(password),
    phone: String(formData.get("phone") ?? "") || undefined,
    name: String(formData.get("name")),
    bio: String(formData.get("bio") ?? "") || undefined,
    areaId: String(formData.get("areaId")),
  });

  await createKitchenSession(kitchen.id);
  redirect("/kitchen");
}

export async function logoutKitchenOwner() {
  await clearKitchenSession();
  redirect("/");
}

export async function markDeliveredAction(formData: FormData) {
  const kitchenId = await getKitchenId();
  if (!kitchenId) redirect("/kitchen/login");

  const orderId = String(formData.get("orderId"));
  // Scoped to this kitchen's own id — an aunty can only mark her own orders,
  // not guess another kitchen's order id and mutate it.
  await prisma.order.updateMany({
    where: { id: orderId, kitchenId },
    data: { status: "delivered" },
  });
  revalidatePath("/kitchen");
}

const MENU_CATEGORIES = ["veg", "jain", "no_onion_garlic"] as const;

export type SaveMenuState = { error?: string; savedAt?: number };

/**
 * Creates/edits/clears the up-to-three dietary-category items (one per
 * `@@unique([menuId, dietaryCategory])`) for one kitchen's (date, meal type)
 * menu. Never trusts a client-supplied kitchenId — always the session's own,
 * same ownership principle as markDeliveredAction above. Gated on
 * kitchen.status === "active", matching the design doc's original intent
 * that menu-setting unlocks only after admin approval (docs/design.md,
 * "Kitchen onboarding is self-serve, admin-gated").
 *
 * A blank input for a category clears that category's item; a non-blank
 * one upserts it. Wrapped in one transaction so a partial failure (e.g. a
 * delete blocked by an existing order's foreign key) doesn't leave some
 * categories saved and others not.
 */
export async function saveMenuAction(_prevState: SaveMenuState, formData: FormData): Promise<SaveMenuState> {
  const kitchenId = await getKitchenId();
  if (!kitchenId) redirect("/kitchen/login");

  const kitchen = await prisma.kitchen.findUniqueOrThrow({ where: { id: kitchenId } });
  if (kitchen.status !== "active") {
    return { error: "Your kitchen must be approved before you can set a menu." };
  }

  const dateStr = String(formData.get("date") ?? "");
  const mealTypeId = String(formData.get("mealTypeId") ?? "");
  if (!dateStr || !mealTypeId) {
    return { error: "Date and meal type are required." };
  }
  const date = new Date(`${dateStr}T00:00:00.000Z`);

  try {
    await prisma.$transaction(async (tx) => {
      const menu = await tx.menu.upsert({
        where: { date_kitchenId_mealTypeId: { date, kitchenId, mealTypeId } },
        update: {},
        create: { date, kitchenId, mealTypeId },
      });

      for (const category of MENU_CATEGORIES) {
        const name = String(formData.get(`name_${category}`) ?? "").trim();
        if (name) {
          await tx.menuItem.upsert({
            where: { menuId_dietaryCategory: { menuId: menu.id, dietaryCategory: category } },
            update: { name },
            create: { menuId: menu.id, dietaryCategory: category, name },
          });
        } else {
          await tx.menuItem.deleteMany({ where: { menuId: menu.id, dietaryCategory: category } });
        }
      }
    });
  } catch (error) {
    // Only the specific, expected failure (a delete blocked by an existing
    // order's foreign key — Prisma P2003) gets the friendly message.
    // Anything else is a real bug and must surface as such, not get
    // silently mislabeled as "already ordered" — that mislabeling was
    // itself a bug: it hid genuine errors (a bad date, a DB hiccup, a
    // stale session) behind a message that didn't match what happened,
    // which is exactly the kind of thing that looks like "sometimes it
    // saves, sometimes it doesn't" with no way to tell why.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
      return { error: "Couldn't save — a menu item you tried to remove has already been ordered by a student." };
    }
    throw error;
  }

  revalidatePath("/kitchen/menu");
  return { savedAt: Date.now() };
}
