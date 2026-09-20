import { Prisma } from "@/lib/generated/prisma/client";

export class CapacityExceededError extends Error {
  constructor(
    public readonly date: Date,
    public readonly kitchenId: string,
    public readonly mealTypeId: string,
  ) {
    super(`No capacity left for kitchen ${kitchenId}, meal type ${mealTypeId} on ${date.toISOString().slice(0, 10)}`);
    this.name = "CapacityExceededError";
  }
}

export class CapacityNotConfiguredError extends Error {
  constructor(
    public readonly date: Date,
    public readonly kitchenId: string,
    public readonly mealTypeId: string,
  ) {
    super(`No kitchen_capacity row for kitchen ${kitchenId}, meal type ${mealTypeId} on ${date.toISOString().slice(0, 10)}`);
    this.name = "CapacityNotConfiguredError";
  }
}

/**
 * Locks the kitchen_capacity row for (date, kitchenId, mealTypeId) with
 * SELECT ... FOR UPDATE, checks reserved_count < max_capacity, and
 * increments it — all within the caller's transaction. Concurrent callers
 * reserving the same (date, kitchenId, mealTypeId) serialize through this
 * row lock instead of racing a read-then-write. Must be called inside a
 * prisma.$transaction callback; the lock is held (and the reservation is
 * only durable) until that transaction commits.
 */
export async function reserveCapacity(
  tx: Prisma.TransactionClient,
  date: Date,
  kitchenId: string,
  mealTypeId: string,
): Promise<void> {
  const rows = await tx.$queryRaw<Array<{ max_capacity: number; reserved_count: number }>>`
    SELECT max_capacity, reserved_count
    FROM kitchen_capacity
    WHERE date = ${date} AND kitchen_id = ${kitchenId} AND meal_type_id = ${mealTypeId}
    FOR UPDATE
  `;

  const row = rows[0];
  if (!row) {
    throw new CapacityNotConfiguredError(date, kitchenId, mealTypeId);
  }
  if (row.reserved_count >= row.max_capacity) {
    throw new CapacityExceededError(date, kitchenId, mealTypeId);
  }

  await tx.$executeRaw`
    UPDATE kitchen_capacity
    SET reserved_count = reserved_count + 1
    WHERE date = ${date} AND kitchen_id = ${kitchenId} AND meal_type_id = ${mealTypeId}
  `;
}
