import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db/client";
import { resolveMenuItem, NoMenuItemAvailableError } from "@/lib/domain/menu/resolveMenuItem";

export interface GenerateOrdersResult {
  eligibleSubscriptions: number;
  created: number;
  alreadyExisted: number;
  skippedNoMenu: number;
  errors: Array<{ subscriptionId: string; message: string }>;
}

/**
 * Materializes tomorrow's deliveries from active subscriptions. THE
 * idempotency guarantee is the `orders` UNIQUE (subscription_id,
 * delivery_date, meal_type_id) constraint below, not anything about how
 * this function is invoked — running it twice for the same date is safe
 * by construction (see docs/design.md).
 *
 * Each subscription is processed independently: one subscription's failure
 * (e.g. no menu configured for its meal type that day) is recorded in
 * `errors` and does not stop the rest of the batch, and does not roll back
 * orders already created for other subscriptions.
 */
export async function generateOrders(date: Date): Promise<GenerateOrdersResult> {
  const eligible = await prisma.subscription.findMany({
    where: {
      status: { in: ["active", "grace"] }, // grace still delivers; past_due/paused/cancelled do not
      OR: [{ cancelEffectiveAt: null }, { cancelEffectiveAt: { gt: date } }],
      currentCycleStart: { lte: date },
    },
    include: {
      plan: true,
      skips: { where: { skipDate: date } },
    },
  });

  const result: GenerateOrdersResult = {
    eligibleSubscriptions: eligible.length,
    created: 0,
    alreadyExisted: 0,
    skippedNoMenu: 0,
    errors: [],
  };

  for (const sub of eligible) {
    if (sub.skips.length > 0) {
      continue; // explicitly skipped for this date
    }

    try {
      const menu = await prisma.menu.findUnique({
        where: { date_kitchenId_mealTypeId: { date, kitchenId: sub.kitchenId, mealTypeId: sub.mealTypeId } },
        include: { items: true },
      });
      if (!menu) {
        result.skippedNoMenu++;
        continue;
      }

      const resolved = resolveMenuItem(sub.dietaryPreference, menu.items);
      const amountPaise = Math.round(sub.plan.pricePaise / sub.plan.mealsPerWeek);

      const inserted = await prisma.$executeRaw`
        INSERT INTO orders (
          id, subscription_id, kitchen_id, delivery_date, meal_type_id, menu_item_id,
          address_id, status, amount_paise, substituted_from, created_at
        )
        VALUES (${randomUUID()}, ${sub.id}, ${sub.kitchenId}, ${date}, ${sub.mealTypeId}, ${resolved.menuItemId},
                ${sub.addressId}, 'scheduled', ${amountPaise}, ${resolved.substitutedFrom}, now())
        ON CONFLICT (subscription_id, delivery_date, meal_type_id) DO NOTHING
      `;

      if (inserted === 1) {
        result.created++;
      } else {
        result.alreadyExisted++;
      }
    } catch (error) {
      if (error instanceof NoMenuItemAvailableError) {
        result.skippedNoMenu++;
      } else {
        result.errors.push({
          subscriptionId: sub.id,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  return result;
}
