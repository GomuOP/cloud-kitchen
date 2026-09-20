import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/client";
import { CapacityExceededError, reserveCapacity } from "./reserveCapacity";

// This test hits a real Postgres (DATABASE_URL) because the thing under
// test — SELECT ... FOR UPDATE serializing concurrent transactions — is
// exactly the behavior an in-memory fake would paper over. Requires
// `docker compose up -d` locally; see README.
describe("reserveCapacity: concurrent signup race", () => {
  const testDate = new Date("2099-01-01T00:00:00.000Z");
  let mealTypeId: string;
  let kitchenId: string;
  let areaId: string;

  beforeAll(async () => {
    const mealType = await prisma.mealType.upsert({
      where: { code: "test-concurrency-meal" },
      update: {},
      create: { code: "test-concurrency-meal", name: "Test Concurrency Meal" },
    });
    mealTypeId = mealType.id;

    const area = await prisma.deliveryArea.upsert({
      where: { code: "TEST-AREA" },
      update: {},
      create: { code: "TEST-AREA", name: "Test Area" },
    });
    areaId = area.id;

    const kitchen = await prisma.kitchen.upsert({
      where: { email: "test-concurrency-kitchen@example.com" },
      update: {},
      create: {
        ownerName: "Test Aunty",
        email: "test-concurrency-kitchen@example.com",
        passwordHash: "test:test",
        name: "Test Kitchen",
        areaId,
        status: "active",
      },
    });
    kitchenId = kitchen.id;

    await prisma.kitchenCapacity.upsert({
      where: { date_kitchenId_mealTypeId: { date: testDate, kitchenId, mealTypeId } },
      update: { maxCapacity: 3, reservedCount: 0 },
      create: { date: testDate, kitchenId, mealTypeId, maxCapacity: 3, reservedCount: 0 },
    });
  });

  afterAll(async () => {
    await prisma.kitchenCapacity.deleteMany({ where: { kitchenId } });
    await prisma.kitchen.delete({ where: { id: kitchenId } });
    await prisma.mealType.delete({ where: { id: mealTypeId } });
    await prisma.deliveryArea.delete({ where: { id: areaId } });
  });

  it("lets exactly max_capacity concurrent reservations through, never oversells", async () => {
    const attempts = 10;

    const results = await Promise.allSettled(
      Array.from({ length: attempts }, () =>
        prisma.$transaction((tx) => reserveCapacity(tx, testDate, kitchenId, mealTypeId)),
      ),
    );

    const succeeded = results.filter((r) => r.status === "fulfilled");
    const failed = results.filter((r) => r.status === "rejected");

    expect(succeeded).toHaveLength(3);
    expect(failed).toHaveLength(attempts - 3);
    for (const failure of failed) {
      expect((failure as PromiseRejectedResult).reason).toBeInstanceOf(CapacityExceededError);
    }

    const row = await prisma.kitchenCapacity.findUniqueOrThrow({
      where: { date_kitchenId_mealTypeId: { date: testDate, kitchenId, mealTypeId } },
    });
    expect(row.reservedCount).toBe(3);
  });
});
