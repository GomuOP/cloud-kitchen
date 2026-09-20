"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/client";
import { createCustomerSession, clearCustomerSession, getCustomerUserId } from "@/lib/auth/session";
import { hashPassword, verifyPassword, MIN_PASSWORD_LENGTH } from "@/lib/auth/password";
import {
  createSignupOrder,
  finalizeSignup,
  pauseSubscription,
  resumeSubscription,
  skipDay,
  cancelSubscription,
  SignupPaymentFailedError,
  SignupCapacityLostAfterPaymentError,
  type SignupInput,
} from "@/lib/domain/subscription/actions";
import type { VerifyPaymentInput } from "@/lib/domain/billing/PaymentProvider";
import type { DietaryCategory } from "@/lib/generated/prisma/client";
import { businessTomorrow } from "@/lib/domain/time";

export type FormActionState = { error?: string };

// Returns { error } instead of throwing — see the comment on this same
// pattern in app/actions/kitchen.ts (Next.js redacts thrown Error messages
// from Server Actions in production; useActionState is the correct fix).

// Generic error message on failure (unknown email or wrong password) —
// doesn't reveal which one was wrong, to avoid leaking which emails have
// accounts.
export async function loginCustomer(_prevState: FormActionState, formData: FormData): Promise<FormActionState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !verifyPassword(password, user.passwordHash)) {
    return { error: "Invalid email or password." };
  }

  await createCustomerSession(user.id);
  redirect("/account");
}

export async function signupCustomer(_prevState: FormActionState, formData: FormData): Promise<FormActionState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const name = String(formData.get("name") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  if (!email || !name) {
    return { error: "Email and name are required." };
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` };
  }
  if (password !== confirmPassword) {
    return { error: "Passwords don't match." };
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return { error: "An account already exists with that email — try logging in instead." };
  }

  const user = await prisma.user.create({
    data: { email, name, passwordHash: hashPassword(password) },
  });

  await createCustomerSession(user.id);
  redirect("/account");
}

export async function logoutCustomer() {
  await clearCustomerSession();
  redirect("/login");
}

export interface SubscribeFormValues {
  planId: string;
  dietaryPreference: DietaryCategory;
  address: { line1: string; line2?: string; areaId: string; pincode: string };
}

/**
 * Step 1, called from the client SubscribeForm before opening the checkout
 * widget. Email/name/phone are deliberately re-derived from the session
 * here, never taken from client input — a checkout payload is not a place
 * to trust a client-supplied identity.
 */
export async function createSignupOrderAction(values: SubscribeFormValues) {
  const userId = await getCustomerUserId();
  if (!userId) redirect("/login");

  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const signupInput: SignupInput = {
    email: user.email,
    name: user.name,
    phone: user.phone ?? undefined,
    planId: values.planId,
    dietaryPreference: values.dietaryPreference,
    address: values.address,
  };

  const order = await createSignupOrder(signupInput);
  return { order, signupInput };
}

export type FinalizeSignupResult = { ok: true } | { ok: false; error: string };

/**
 * Step 2, called once the checkout widget reports success (or immediately,
 * for the mock provider, which has no widget). Re-checks the session's
 * email against signupInput.email so a tampered client payload can't
 * finalize a subscription under a different account than the one that's
 * actually logged in.
 *
 * Returns a result object instead of throwing for the two *expected*
 * failure modes (declined payment, capacity lost mid-checkout) — Next.js
 * redacts custom Error messages thrown from Server Actions in production
 * builds (by design, to avoid leaking internals), so a thrown Error here
 * would reach the client as an opaque generic message instead of the
 * specific, actionable text these two cases need. Anything else (a real
 * bug) still throws and gets that redaction, which is the right behavior
 * for a genuinely unexpected error.
 */
export async function finalizeSignupAction(
  signupInput: SignupInput,
  verification: VerifyPaymentInput,
): Promise<FinalizeSignupResult> {
  const userId = await getCustomerUserId();
  if (!userId) redirect("/login");

  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (user.email !== signupInput.email) {
    return { ok: false, error: "Session does not match this checkout — please log in again and retry." };
  }

  try {
    await finalizeSignup(signupInput, verification);
  } catch (error) {
    if (error instanceof SignupPaymentFailedError || error instanceof SignupCapacityLostAfterPaymentError) {
      return { ok: false, error: error.message };
    }
    throw error;
  }

  revalidatePath("/account");
  redirect("/account");
}

// Every action below takes a client-supplied subscriptionId from a hidden
// form field. That id must be checked against the logged-in customer's own
// subscriptions before acting on it — otherwise any logged-in customer could
// pause/resume/skip/cancel another customer's subscription by resubmitting
// the form with a different id. Same scoping principle as
// markDeliveredAction in app/actions/kitchen.ts (order id + kitchenId).
async function requireOwnSubscriptionId(formData: FormData): Promise<string> {
  const userId = await getCustomerUserId();
  if (!userId) redirect("/login");

  const subscriptionId = String(formData.get("subscriptionId"));
  const owned = await prisma.subscription.findFirst({
    where: { id: subscriptionId, userId },
    select: { id: true },
  });
  if (!owned) {
    throw new Error("Subscription not found");
  }
  return subscriptionId;
}

export async function pauseAction(formData: FormData) {
  const subscriptionId = await requireOwnSubscriptionId(formData);
  const resumeAtRaw = String(formData.get("resumeAt") ?? "");
  const resumeAt = resumeAtRaw ? new Date(`${resumeAtRaw}T00:00:00.000Z`) : null;
  await pauseSubscription(subscriptionId, resumeAt);
  revalidatePath("/account");
}

export async function resumeAction(formData: FormData) {
  const subscriptionId = await requireOwnSubscriptionId(formData);
  await resumeSubscription(subscriptionId);
  revalidatePath("/account");
}

export async function skipTomorrowAction(formData: FormData) {
  const subscriptionId = await requireOwnSubscriptionId(formData);
  await skipDay(subscriptionId, businessTomorrow());
  revalidatePath("/account");
}

export async function cancelAction(formData: FormData) {
  const subscriptionId = await requireOwnSubscriptionId(formData);
  const immediate = formData.get("immediate") === "true";
  await cancelSubscription(subscriptionId, immediate);
  revalidatePath("/account");
}
