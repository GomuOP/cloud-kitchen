import { prisma } from "@/lib/db/client";

export interface RegisterKitchenInput {
  ownerName: string;
  email: string;
  passwordHash: string;
  phone?: string;
  name: string;
  bio?: string;
  areaId: string;
}

/**
 * A kitchen (aunty) is not a state machine the way subscriptions are — it's
 * a simple three-state moderation flow (pending_approval -> active, or ->
 * suspended and back) and doesn't warrant the transition-table treatment
 * that subscriptions get. New kitchens always start pending_approval,
 * per the user's decision that aunties self-register but an admin approves.
 */
export async function registerKitchen(input: RegisterKitchenInput) {
  return prisma.kitchen.create({
    data: {
      ownerName: input.ownerName,
      email: input.email,
      passwordHash: input.passwordHash,
      phone: input.phone,
      name: input.name,
      bio: input.bio,
      areaId: input.areaId,
      status: "pending_approval",
    },
  });
}

export async function approveKitchen(kitchenId: string) {
  await prisma.kitchen.update({
    where: { id: kitchenId },
    data: { status: "active", approvedAt: new Date() },
  });
}

export async function suspendKitchen(kitchenId: string) {
  await prisma.kitchen.update({ where: { id: kitchenId }, data: { status: "suspended" } });
}

export async function reactivateKitchen(kitchenId: string) {
  await prisma.kitchen.update({ where: { id: kitchenId }, data: { status: "active" } });
}
