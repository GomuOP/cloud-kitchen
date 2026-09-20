import "dotenv/config";
import { prisma } from "@/lib/db/client";
import { ensureCapacityWindow } from "@/lib/domain/capacity/ensureCapacityWindow";
import { DEFAULT_KITCHEN_CAPACITY_PER_MEAL_TYPE, CAPACITY_HORIZON_DAYS } from "@/lib/config/business";
import { addDays, businessToday } from "@/lib/domain/time";
import { createSignupOrder, finalizeSignup } from "@/lib/domain/subscription/actions";
import { registerKitchen, approveKitchen } from "@/lib/domain/kitchen/actions";
import { hashPassword } from "@/lib/auth/password";

// One shared password for every seeded demo account (students and kitchens
// alike) — documented in README/login-page copy so an interviewer can log
// in as any seeded account without hunting for credentials.
export const DEMO_PASSWORD = "tiffin123";

// A 4-day rotation, so the "menu rotation" requirement is visible in a short demo window.
const LUNCH_ROTATION = [
  { veg: "Paneer Butter Masala + Rice", jain: "Jain Paneer Masala + Rice", no_onion_garlic: "Paneer Masala (no onion/garlic) + Rice" },
  { veg: "Chana Masala + Roti", jain: "Jain Chana + Roti", no_onion_garlic: "Chana (no onion/garlic) + Roti" },
  { veg: "Mixed Veg Curry + Rice", jain: "Jain Mixed Veg + Rice", no_onion_garlic: "Mixed Veg (no onion/garlic) + Rice" },
  { veg: "Dal Tadka + Roti", jain: "Jain Dal + Roti", no_onion_garlic: "Dal (no onion/garlic) + Roti" },
];

const DINNER_ROTATION = [
  { veg: "Veg Pulao + Raita", jain: "Jain Pulao + Raita", no_onion_garlic: "Pulao (no onion/garlic) + Raita" },
  { veg: "Rajma + Rice", jain: "Jain Rajma + Rice", no_onion_garlic: "Rajma (no onion/garlic) + Rice" },
  { veg: "Aloo Gobi + Roti", jain: "Jain Aloo Gobi + Roti", no_onion_garlic: "Aloo Gobi (no onion/garlic) + Roti" },
  { veg: "Kadhi + Rice", jain: "Jain Kadhi + Rice", no_onion_garlic: "Kadhi (no onion/garlic) + Rice" },
];

async function seedMenusForKitchen(kitchenId: string, mealTypeId: string, rotation: typeof LUNCH_ROTATION) {
  const today = businessToday();
  for (let offset = 0; offset < CAPACITY_HORIZON_DAYS; offset++) {
    const date = addDays(today, offset);
    const dishes = rotation[offset % rotation.length];
    const menu = await prisma.menu.upsert({
      where: { date_kitchenId_mealTypeId: { date, kitchenId, mealTypeId } },
      update: {},
      create: { date, kitchenId, mealTypeId },
    });
    for (const category of ["veg", "jain", "no_onion_garlic"] as const) {
      await prisma.menuItem.upsert({
        where: { menuId_dietaryCategory: { menuId: menu.id, dietaryCategory: category } },
        update: { name: dishes[category] },
        create: { menuId: menu.id, dietaryCategory: category, name: dishes[category] },
      });
    }
  }
}

async function main() {
  console.log("Seeding meal types...");
  const lunch = await prisma.mealType.upsert({
    where: { code: "lunch" },
    update: {},
    create: { code: "lunch", name: "Lunch" },
  });
  const dinner = await prisma.mealType.upsert({
    where: { code: "dinner" },
    update: {},
    create: { code: "dinner", name: "Dinner" },
  });

  console.log("Seeding delivery areas...");
  const [koramangala, indiranagar, hsr] = await Promise.all(
    [
      { code: "KOR", name: "Koramangala" },
      { code: "IND", name: "Indiranagar" },
      { code: "HSR", name: "HSR Layout" },
    ].map((a) => prisma.deliveryArea.upsert({ where: { code: a.code }, update: {}, create: a })),
  );

  console.log("Seeding kitchens (chefs)...");

  const demoPasswordHash = hashPassword(DEMO_PASSWORD);

  let lakshmi = await prisma.kitchen.findUnique({ where: { email: "lakshmi@example.com" } });
  if (!lakshmi) {
    lakshmi = await registerKitchen({
      ownerName: "Lakshmi Amma",
      email: "lakshmi@example.com",
      passwordHash: demoPasswordHash,
      name: "Lakshmi's Tiffin",
      bio: "Home-style South Indian, veg only, 20 years of cooking for the neighborhood.",
      areaId: koramangala.id,
    });
    await approveKitchen(lakshmi.id);
    lakshmi = await prisma.kitchen.findUniqueOrThrow({ where: { id: lakshmi.id } });
  }

  let kamala = await prisma.kitchen.findUnique({ where: { email: "kamala@example.com" } });
  if (!kamala) {
    kamala = await registerKitchen({
      ownerName: "Kamala Reddy",
      email: "kamala@example.com",
      passwordHash: demoPasswordHash,
      name: "Kamala's Kitchen",
      bio: "North Indian thalis, lunch only.",
      areaId: indiranagar.id,
    });
    await approveKitchen(kamala.id);
    kamala = await prisma.kitchen.findUniqueOrThrow({ where: { id: kamala.id } });
  }

  // Deliberately left pending_approval — demonstrates the admin approval flow.
  const radhaExisting = await prisma.kitchen.findUnique({ where: { email: "radha@example.com" } });
  if (!radhaExisting) {
    await registerKitchen({
      ownerName: "Radha",
      email: "radha@example.com",
      passwordHash: demoPasswordHash,
      name: "Radha's Home Food",
      bio: "New to the platform — awaiting approval.",
      areaId: hsr.id,
    });
  }

  console.log("Seeding plans...");
  const lakshmiLunchPlan = await prisma.plan.upsert({
    where: { id: "seed-lakshmi-lunch-plan" },
    update: {},
    create: {
      id: "seed-lakshmi-lunch-plan",
      kitchenId: lakshmi.id,
      name: "Lunch Plan",
      mealTypeId: lunch.id,
      mealsPerWeek: 6,
      pricePaise: 300000,
    },
  });
  await prisma.plan.upsert({
    where: { id: "seed-lakshmi-dinner-plan" },
    update: {},
    create: {
      id: "seed-lakshmi-dinner-plan",
      kitchenId: lakshmi.id,
      name: "Dinner Plan",
      mealTypeId: dinner.id,
      mealsPerWeek: 6,
      pricePaise: 280000,
    },
  });
  await prisma.plan.upsert({
    where: { id: "seed-kamala-lunch-plan" },
    update: {},
    create: {
      id: "seed-kamala-lunch-plan",
      kitchenId: kamala.id,
      name: "Lunch Thali Plan",
      mealTypeId: lunch.id,
      mealsPerWeek: 6,
      pricePaise: 320000,
    },
  });

  console.log(`Seeding ${CAPACITY_HORIZON_DAYS} days of menus per kitchen...`);
  await seedMenusForKitchen(lakshmi.id, lunch.id, LUNCH_ROTATION);
  await seedMenusForKitchen(lakshmi.id, dinner.id, DINNER_ROTATION);
  await seedMenusForKitchen(kamala.id, lunch.id, LUNCH_ROTATION);

  console.log("Seeding kitchen capacity windows...");
  await ensureCapacityWindow(DEFAULT_KITCHEN_CAPACITY_PER_MEAL_TYPE);

  console.log("Seeding a demo student subscription (exercises the full order -> verify -> reserve flow)...");
  const existingDemo = await prisma.user.findUnique({ where: { email: "demo@example.com" } });
  if (!existingDemo) {
    // Mirrors the real flow: an account (with a password) exists before
    // checkout ever runs — finalizeSignup no longer creates the user itself.
    await prisma.user.create({
      data: { email: "demo@example.com", name: "Demo Student", phone: "9999999999", passwordHash: demoPasswordHash },
    });

    const signupInput = {
      email: "demo@example.com",
      name: "Demo Student",
      phone: "9999999999",
      planId: lakshmiLunchPlan.id,
      dietaryPreference: "jain" as const,
      address: { line1: "123 MG Road", areaId: koramangala.id, pincode: "560001" },
    };
    const order = await createSignupOrder(signupInput);
    // Standing in for what the client would send after a real checkout
    // completes; the mock provider doesn't check these values.
    await finalizeSignup(signupInput, { orderId: order.orderId, paymentId: "seed", signature: "seed" });
  }

  console.log("Done.", {
    kitchens: { lakshmi: lakshmi.id, kamala: kamala.id, radha: "pending_approval" },
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
