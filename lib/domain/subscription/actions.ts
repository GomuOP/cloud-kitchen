import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db/client";
import type { Prisma, DietaryCategory } from "@/lib/generated/prisma/client";
import { BILLING_CYCLE_DAYS } from "@/lib/config/business";
import { addDays, businessTomorrow, isSkipAllowed } from "@/lib/domain/time";
import {
  transition,
  NONE,
  InvalidTransitionError,
  type SubscriptionStatus,
} from "@/lib/domain/subscription/stateMachine";
import { CapacityExceededError, CapacityNotConfiguredError, reserveCapacity } from "@/lib/domain/capacity/reserveCapacity";
import type { PaymentProvider, VerifyPaymentInput } from "@/lib/domain/billing/PaymentProvider";
import { getPaymentProvider } from "@/lib/domain/billing/getPaymentProvider";

export class SignupPaymentFailedError extends Error {
  constructor() {
    super("Payment did not succeed — no subscription was created");
    this.name = "SignupPaymentFailedError";
  }
}

export class SignupCapacityLostAfterPaymentError extends Error {
  constructor() {
    super(
      "Your payment succeeded, but the last slot for this plan was taken while you were paying. You have been refunded.",
    );
    this.name = "SignupCapacityLostAfterPaymentError";
  }
}

export class SkipCutoffPassedError extends Error {
  constructor(public readonly deliveryDate: Date) {
    super(`Skip cutoff has passed for ${deliveryDate.toISOString().slice(0, 10)}`);
    this.name = "SkipCutoffPassedError";
  }
}

export interface SignupInput {
  email: string;
  name: string;
  phone?: string;
  planId: string;
  dietaryPreference: DietaryCategory;
  address: { line1: string; line2?: string; areaId: string; pincode: string };
}

/**
 * Step 1 of signup: create the order a checkout widget (or the mock, which
 * skips its own widget) checks out against. Deliberately does NOT touch
 * capacity or the database at all — an interactive checkout can take
 * anywhere from two seconds to several minutes (or be abandoned entirely),
 * and holding a `kitchen_capacity` row lock across that whole client-side
 * interaction isn't viable. Capacity is only reserved in finalizeSignup,
 * once payment is actually verified.
 */
export async function createSignupOrder(
  input: SignupInput,
  paymentProvider: PaymentProvider = getPaymentProvider(),
) {
  const plan = await prisma.plan.findUniqueOrThrow({ where: { id: input.planId } });

  // Razorpay's `receipt` field has a hard 56-character limit — a naive
  // receipt built from email + plan id + timestamp can exceed it for a
  // longer email (this shipped once and only broke against the real API,
  // since the mock never validated length; see docs/design.md). Use a
  // short random id instead, well under the limit even with the demo-only
  // failure marker appended.
  //
  // Demo-only failure trigger: an email containing "+fail@" produces an
  // order the provider will report as failed, without needing a real
  // declined test card.
  const failMarker = input.email.includes("+fail@") ? ":fail" : "";
  const receipt = `${randomUUID()}${failMarker}`;

  const order = await paymentProvider.createOrder({ amountPaise: plan.pricePaise, receipt });

  return {
    orderId: order.orderId,
    publicKeyId: order.publicKeyId,
    amountPaise: plan.pricePaise,
    provider: paymentProvider.name,
  };
}

/**
 * Step 2 of signup: verify the payment actually happened (never trust a
 * client-supplied "it succeeded"), then reserve capacity and create the
 * subscription in one transaction. If capacity ran out between order
 * creation and payment completing — the exact race this project's capacity
 * mechanism exists to catch — the student has already paid, so this
 * refunds them rather than silently keeping their money; it does not
 * create a subscription.
 *
 * Idempotent against a duplicate call for the same order (e.g. a retried
 * client request after a network blip): payments.idempotency_key is keyed
 * on the order id, so a second call finds the already-created subscription
 * instead of double-charging capacity or creating a second subscription.
 */
export async function finalizeSignup(
  input: SignupInput,
  verification: VerifyPaymentInput,
  paymentProvider: PaymentProvider = getPaymentProvider(),
) {
  const idempotencyKey = `signup:order:${verification.orderId}`;

  const existingPayment = await prisma.payment.findUnique({
    where: { idempotencyKey },
    include: { subscription: true },
  });
  if (existingPayment?.subscription) {
    return existingPayment.subscription;
  }

  const plan = await prisma.plan.findUniqueOrThrow({ where: { id: input.planId } });
  const verifyResult = await paymentProvider.verifyPayment(verification);

  if (verifyResult.status === "failed") {
    throw new SignupPaymentFailedError();
  }

  const startDate = businessTomorrow();
  const cycleEnd = addDays(startDate, BILLING_CYCLE_DAYS);

  try {
    return await prisma.$transaction(async (tx) => {
      // The account always already exists by this point — every real caller
      // (finalizeSignupAction) requires a logged-in session before it ever
      // reaches here, and login now means "has a password," which is set at
      // signup, not at checkout. Fetching (not upserting) makes that
      // invariant explicit rather than papering over it with a dead create
      // branch that would need a password it doesn't have.
      const user = await tx.user.findUniqueOrThrow({ where: { email: input.email } });

      const address = await tx.address.create({
        data: {
          userId: user.id,
          line1: input.address.line1,
          line2: input.address.line2,
          areaId: input.address.areaId,
          pincode: input.address.pincode,
        },
      });

      await reserveCapacity(tx, startDate, plan.kitchenId, plan.mealTypeId);

      const status = transition(NONE, "SIGNUP_PAID");

      const subscription = await tx.subscription.create({
        data: {
          userId: user.id,
          kitchenId: plan.kitchenId,
          planId: plan.id,
          mealTypeId: plan.mealTypeId,
          addressId: address.id,
          dietaryPreference: input.dietaryPreference,
          status,
          statusSince: new Date(),
          currentCycleStart: startDate,
          currentCycleEnd: cycleEnd,
          nextBillingDate: cycleEnd,
        },
      });

      await tx.subscriptionStatusHistory.create({
        data: {
          subscriptionId: subscription.id,
          fromStatus: null,
          toStatus: status,
          reason: "signup",
          actor: "user",
        },
      });

      await tx.payment.create({
        data: {
          userId: user.id,
          kitchenId: plan.kitchenId,
          subscriptionId: subscription.id,
          billingPeriodStart: startDate,
          amountPaise: plan.pricePaise,
          status: "success",
          providerRef: verifyResult.providerRef,
          idempotencyKey,
        },
      });

      return subscription;
    });
  } catch (error) {
    if (error instanceof CapacityExceededError || error instanceof CapacityNotConfiguredError) {
      await paymentProvider.refund({ providerRef: verifyResult.providerRef, amountPaise: plan.pricePaise });
      throw new SignupCapacityLostAfterPaymentError();
    }
    throw error;
  }
}

async function writeStatusHistory(
  tx: Prisma.TransactionClient,
  subscriptionId: string,
  fromStatus: SubscriptionStatus,
  toStatus: SubscriptionStatus,
  reason: string,
  actor: "user" | "system",
) {
  await tx.subscriptionStatusHistory.create({
    data: { subscriptionId, fromStatus, toStatus, reason, actor },
  });
}

export async function pauseSubscription(subscriptionId: string, resumeAt: Date | null, reason?: string) {
  return prisma.$transaction(async (tx) => {
    const sub = await tx.subscription.findUniqueOrThrow({ where: { id: subscriptionId } });
    const nextStatus = transition(sub.status, "PAUSE");

    await tx.subscription.update({
      where: { id: subscriptionId },
      data: { status: nextStatus, statusSince: new Date() },
    });
    await tx.subscriptionPause.create({
      data: { subscriptionId, pausedAt: new Date(), resumeAt, reason },
    });
    await writeStatusHistory(tx, subscriptionId, sub.status, nextStatus, reason ?? "user_pause", "user");
  });
}

export async function resumeSubscription(subscriptionId: string) {
  return prisma.$transaction(async (tx) => {
    const sub = await tx.subscription.findUniqueOrThrow({ where: { id: subscriptionId } });
    const nextStatus = transition(sub.status, "RESUME");

    const openPause = await tx.subscriptionPause.findFirst({
      where: { subscriptionId, resumedAt: null },
      orderBy: { pausedAt: "desc" },
    });
    if (!openPause) {
      throw new Error(`No open pause found for subscription ${subscriptionId}`);
    }

    const resumedAt = new Date();
    const pausedMs = resumedAt.getTime() - openPause.pausedAt.getTime();
    const extendedCycleEnd = new Date(sub.currentCycleEnd.getTime() + pausedMs);

    await tx.subscriptionPause.update({
      where: { id: openPause.id },
      data: { resumedAt },
    });
    await tx.subscription.update({
      where: { id: subscriptionId },
      data: { status: nextStatus, statusSince: resumedAt, currentCycleEnd: extendedCycleEnd },
    });
    await writeStatusHistory(tx, subscriptionId, sub.status, nextStatus, "user_resume", "user");
  });
}

export async function skipDay(subscriptionId: string, skipDate: Date) {
  if (!isSkipAllowed(skipDate)) {
    throw new SkipCutoffPassedError(skipDate);
  }
  const sub = await prisma.subscription.findUniqueOrThrow({ where: { id: subscriptionId } });
  if (sub.status !== "active") {
    throw new Error(`Cannot skip: subscription ${subscriptionId} is not active (status: ${sub.status})`);
  }
  await prisma.dailySkip.upsert({
    where: { subscriptionId_skipDate: { subscriptionId, skipDate } },
    update: {},
    create: { subscriptionId, skipDate },
  });
}

export async function cancelSubscription(subscriptionId: string, immediate: boolean, reason?: string) {
  return prisma.$transaction(async (tx) => {
    const sub = await tx.subscription.findUniqueOrThrow({ where: { id: subscriptionId } });
    const now = new Date();
    const effectiveAt = immediate ? now : sub.currentCycleEnd;

    if (!immediate) {
      // Deferred cancel: record intent now, but the status transition itself
      // doesn't happen until a lifecycle sweep sees cancel_effective_at has
      // passed (see lib/domain/subscription/lifecycle.ts). Status stays
      // whatever it currently is.
      await tx.subscription.update({
        where: { id: subscriptionId },
        data: { cancelRequestedAt: now, cancelEffectiveAt: effectiveAt },
      });
      return;
    }

    const nextStatus = transition(sub.status, "CANCEL");
    await tx.subscription.update({
      where: { id: subscriptionId },
      data: {
        status: nextStatus,
        statusSince: now,
        cancelRequestedAt: now,
        cancelEffectiveAt: effectiveAt,
      },
    });
    await writeStatusHistory(tx, subscriptionId, sub.status, nextStatus, reason ?? "user_cancel_immediate", "user");
  });
}

export { InvalidTransitionError };
