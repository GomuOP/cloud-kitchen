import { prisma } from "@/lib/db/client";
import { PLATFORM_COMMISSION_BPS } from "@/lib/config/business";

export interface GeneratePayoutsResult {
  payoutsCreated: number;
  totalNetPaise: number;
}

/**
 * Settles every kitchen's unpaid-out successful payments into one Payout
 * each. Idempotent the same way orders/routes are: a payment is claimed by
 * setting its payout_id, so a payment can be folded into at most one
 * payout — re-running this after it already ran finds no unclaimed
 * payments left and creates nothing.
 *
 * Commission is computed in basis points (integer), never a float
 * percentage, for the same reason money itself is paise: percentages of
 * money are still money math, and money math must never touch floats.
 */
export async function generatePayouts(now: Date = new Date()): Promise<GeneratePayoutsResult> {
  const kitchensWithUnsettledPayments = await prisma.payment.findMany({
    where: { status: "success", payoutId: null },
    select: { kitchenId: true },
    distinct: ["kitchenId"],
  });

  let payoutsCreated = 0;
  let totalNetPaise = 0;

  for (const { kitchenId } of kitchensWithUnsettledPayments) {
    const payout = await prisma.$transaction(async (tx) => {
      const payments = await tx.payment.findMany({
        where: { kitchenId, status: "success", payoutId: null },
      });
      if (payments.length === 0) {
        return null;
      }

      const grossPaise = payments.reduce((sum, p) => sum + p.amountPaise, 0);
      const commissionPaise = Math.round((grossPaise * PLATFORM_COMMISSION_BPS) / 10_000);
      const netPaise = grossPaise - commissionPaise;
      const periodStart = payments.reduce(
        (min, p) => (p.createdAt < min ? p.createdAt : min),
        payments[0].createdAt,
      );

      const created = await tx.payout.create({
        data: {
          kitchenId,
          periodStart,
          periodEnd: now,
          grossPaise,
          commissionRateBps: PLATFORM_COMMISSION_BPS,
          commissionPaise,
          netPaise,
        },
      });

      await tx.payment.updateMany({
        where: { id: { in: payments.map((p) => p.id) } },
        data: { payoutId: created.id },
      });

      return created;
    });

    if (payout) {
      payoutsCreated++;
      totalNetPaise += payout.netPaise;
    }
  }

  return { payoutsCreated, totalNetPaise };
}

export async function markPayoutPaid(payoutId: string) {
  await prisma.payout.update({ where: { id: payoutId }, data: { status: "paid", paidAt: new Date() } });
}
