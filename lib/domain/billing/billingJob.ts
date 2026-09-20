import { prisma } from "@/lib/db/client";
import { BILLING_CYCLE_DAYS } from "@/lib/config/business";
import { addDays } from "@/lib/domain/time";
import { recordPaymentFailure } from "@/lib/domain/subscription/lifecycle";
import { MockPaymentProvider } from "./MockPaymentProvider";

// Renewals always use the mock, deliberately, regardless of which provider
// signup() is using. A background nightly job has no user present to
// redirect through an interactive checkout widget — real recurring billing
// without a human in the loop needs a saved payment method / UPI mandate
// collected at signup time (Razorpay Subscriptions or tokenized cards),
// which is a materially bigger feature than this portfolio project's scope.
// Flagged here rather than silently faked. See docs/design.md.
const renewalProvider = new MockPaymentProvider();

export interface BillingRunResult {
  charged: number;
  succeeded: number;
  failed: number;
}

/**
 * Charges every active subscription whose nextBillingDate has arrived.
 * Independent of daily order generation (per docs/design.md) — this never
 * touches `orders`, only `subscriptions` and `payments`. A failed charge
 * moves the subscription to grace via recordPaymentFailure; it does not
 * retroactively affect any order already generated.
 *
 * Idempotency: each charge attempt's idempotencyKey is keyed on
 * (subscriptionId, the cycle being billed), via a UNIQUE constraint on
 * payments.idempotency_key — re-running this job for a date it already
 * processed re-attempts the same key and Postgres rejects the duplicate
 * insert, so `payments` stays consistent even on a naive rerun.
 */
export async function runBilling(date: Date = new Date()): Promise<BillingRunResult> {
  const due = await prisma.subscription.findMany({
    where: { status: "active", nextBillingDate: { lte: date } },
    include: { plan: true, user: true },
  });

  let succeeded = 0;
  let failed = 0;

  for (const sub of due) {
    const idempotencyKey = `billing:${sub.id}:${sub.nextBillingDate.toISOString().slice(0, 10)}`;

    const existing = await prisma.payment.findUnique({ where: { idempotencyKey } });
    if (existing) {
      continue;
    }

    const receipt = `${idempotencyKey}${sub.user.email.includes("+fail@") ? ":fail" : ""}`;
    const order = await renewalProvider.createOrder({ amountPaise: sub.plan.pricePaise, receipt });
    const result = await renewalProvider.verifyPayment({ orderId: order.orderId, paymentId: "", signature: "" });

    try {
      await prisma.payment.create({
        data: {
          userId: sub.userId,
          kitchenId: sub.kitchenId,
          subscriptionId: sub.id,
          billingPeriodStart: sub.nextBillingDate,
          amountPaise: sub.plan.pricePaise,
          status: result.status,
          providerRef: result.providerRef,
          idempotencyKey,
        },
      });
    } catch {
      // Unique violation: another concurrent run already recorded this
      // charge for this cycle. Safe to skip — the payment row already exists.
      continue;
    }

    if (result.status === "success") {
      const newCycleStart = sub.nextBillingDate;
      const newCycleEnd = addDays(newCycleStart, BILLING_CYCLE_DAYS);
      await prisma.subscription.update({
        where: { id: sub.id },
        data: { currentCycleStart: newCycleStart, currentCycleEnd: newCycleEnd, nextBillingDate: newCycleEnd },
      });
      succeeded++;
    } else {
      await recordPaymentFailure(sub.id);
      failed++;
    }
  }

  return { charged: due.length, succeeded, failed };
}
