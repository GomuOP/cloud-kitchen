import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db/client";
import { CAPACITY_HORIZON_DAYS } from "@/lib/config/business";
import { addDays, businessToday } from "@/lib/domain/time";

/**
 * Keeps kitchen_capacity populated for the next CAPACITY_HORIZON_DAYS days,
 * for every (kitchen, meal type) combination an active kitchen actually
 * offers a plan for — not a blind cartesian product of all kitchens x all
 * meal types, since a kitchen might only do lunch. ON CONFLICT DO NOTHING
 * makes this safe to call repeatedly (from the seed script and from the
 * daily pipeline) without clobbering a capacity row a kitchen owner has
 * already hand-adjusted for a specific date.
 */
export async function ensureCapacityWindow(defaultCapacity: number, now: Date = new Date()): Promise<void> {
  const offerings = await prisma.plan.findMany({
    where: { active: true, kitchen: { status: "active" } },
    select: { kitchenId: true, mealTypeId: true },
    distinct: ["kitchenId", "mealTypeId"],
  });

  const today = businessToday(now);

  for (let offset = 0; offset < CAPACITY_HORIZON_DAYS; offset++) {
    const date = addDays(today, offset);
    for (const offering of offerings) {
      await prisma.$executeRaw`
        INSERT INTO kitchen_capacity (id, date, kitchen_id, meal_type_id, max_capacity, reserved_count)
        VALUES (${randomUUID()}, ${date}, ${offering.kitchenId}, ${offering.mealTypeId}, ${defaultCapacity}, 0)
        ON CONFLICT (date, kitchen_id, meal_type_id) DO NOTHING
      `;
    }
  }
}
