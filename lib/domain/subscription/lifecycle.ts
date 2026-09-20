import { prisma } from "@/lib/db/client";
import { GRACE_PERIOD_DAYS, PAST_DUE_PERIOD_DAYS } from "@/lib/config/business";
import { addDays } from "@/lib/domain/time";
import { transition } from "@/lib/domain/subscription/stateMachine";

/** Payment failed for an active subscription: active -> grace, with a fixed deadline. */
export async function recordPaymentFailure(subscriptionId: string) {
  return prisma.$transaction(async (tx) => {
    const sub = await tx.subscription.findUniqueOrThrow({ where: { id: subscriptionId } });
    const nextStatus = transition(sub.status, "PAYMENT_FAILED");
    const now = new Date();
    await tx.subscription.update({
      where: { id: subscriptionId },
      data: { status: nextStatus, statusSince: now, graceExpiresAt: addDays(now, GRACE_PERIOD_DAYS) },
    });
    await tx.subscriptionStatusHistory.create({
      data: { subscriptionId, fromStatus: sub.status, toStatus: nextStatus, reason: "payment_failed", actor: "system" },
    });
  });
}

/** Payment succeeded while in grace or past_due: back to active, deadlines cleared. */
export async function recordPaymentSuccess(subscriptionId: string) {
  return prisma.$transaction(async (tx) => {
    const sub = await tx.subscription.findUniqueOrThrow({ where: { id: subscriptionId } });
    const nextStatus = transition(sub.status, "PAYMENT_SUCCEEDED");
    const now = new Date();
    await tx.subscription.update({
      where: { id: subscriptionId },
      data: { status: nextStatus, statusSince: now, graceExpiresAt: null, pastDueExpiresAt: null },
    });
    await tx.subscriptionStatusHistory.create({
      data: { subscriptionId, fromStatus: sub.status, toStatus: nextStatus, reason: "payment_succeeded", actor: "system" },
    });
  });
}

export interface SweepResult {
  graceExpired: number;
  pastDueExpired: number;
  scheduledCancellations: number;
}

/**
 * Time-driven transitions that aren't triggered by a user or payment-webhook
 * action: grace -> past_due, past_due -> cancelled, and applying deferred
 * cancellations once cancel_effective_at has passed. Meant to be called once
 * per daily pipeline run (see lib/jobs/dailyPipeline.ts). Idempotent by
 * construction: each query only selects rows still in the state being
 * transitioned out of, so re-running finds nothing left to do.
 */
export async function sweepSubscriptionLifecycle(now: Date = new Date()): Promise<SweepResult> {
  const graceExpiredSubs = await prisma.subscription.findMany({
    where: { status: "grace", graceExpiresAt: { lte: now } },
    select: { id: true, status: true },
  });
  for (const sub of graceExpiredSubs) {
    await prisma.$transaction(async (tx) => {
      const nextStatus = transition(sub.status, "GRACE_EXPIRED");
      await tx.subscription.update({
        where: { id: sub.id },
        data: { status: nextStatus, statusSince: now, pastDueExpiresAt: addDays(now, PAST_DUE_PERIOD_DAYS) },
      });
      await tx.subscriptionStatusHistory.create({
        data: { subscriptionId: sub.id, fromStatus: sub.status, toStatus: nextStatus, reason: "grace_expired", actor: "system" },
      });
    });
  }

  const pastDueExpiredSubs = await prisma.subscription.findMany({
    where: { status: "past_due", pastDueExpiresAt: { lte: now } },
    select: { id: true, status: true },
  });
  for (const sub of pastDueExpiredSubs) {
    await prisma.$transaction(async (tx) => {
      const nextStatus = transition(sub.status, "PAST_DUE_EXPIRED");
      await tx.subscription.update({
        where: { id: sub.id },
        data: { status: nextStatus, statusSince: now },
      });
      await tx.subscriptionStatusHistory.create({
        data: { subscriptionId: sub.id, fromStatus: sub.status, toStatus: nextStatus, reason: "past_due_expired", actor: "system" },
      });
    });
  }

  const scheduledCancellations = await prisma.subscription.findMany({
    where: {
      cancelEffectiveAt: { lte: now },
      status: { in: ["active", "paused", "grace", "past_due"] },
    },
    select: { id: true, status: true },
  });
  for (const sub of scheduledCancellations) {
    await prisma.$transaction(async (tx) => {
      const nextStatus = transition(sub.status, "CANCEL");
      await tx.subscription.update({
        where: { id: sub.id },
        data: { status: nextStatus, statusSince: now },
      });
      await tx.subscriptionStatusHistory.create({
        data: { subscriptionId: sub.id, fromStatus: sub.status, toStatus: nextStatus, reason: "scheduled_cancellation", actor: "system" },
      });
    });
  }

  return {
    graceExpired: graceExpiredSubs.length,
    pastDueExpired: pastDueExpiredSubs.length,
    scheduledCancellations: scheduledCancellations.length,
  };
}
