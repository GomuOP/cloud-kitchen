import { prisma } from "@/lib/db/client";
import { businessTomorrow } from "@/lib/domain/time";
import { pauseSubscription, resumeSubscription, skipDay, cancelSubscription } from "@/lib/domain/subscription/actions";

// Shared, userId-scoped read/mutate helpers used by both assistant backends
// (the deterministic rule-based one in app/actions/assistant.ts and the
// LLM/tool-calling one in lib/domain/assistant/llmChat.ts — see
// docs/design.md "Phase 7"), so the two don't duplicate what counts as
// "this customer's own data" or how a mutation is applied.

export type ActionKind = "pause" | "resume" | "skip" | "cancel";

export async function loadSubscriptions(userId: string) {
  return prisma.subscription.findMany({
    where: { userId },
    include: { kitchen: true, plan: true, mealType: true },
    orderBy: { createdAt: "desc" },
  });
}

export type SubscriptionWithRelations = Awaited<ReturnType<typeof loadSubscriptions>>[number];

export function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function describeSub(sub: SubscriptionWithRelations): string {
  return `${sub.kitchen.name} (${sub.plan.name}, ${sub.status})`;
}

export async function getNextDelivery(userId: string) {
  return prisma.order.findFirst({
    where: { subscription: { userId }, deliveryDate: { gte: businessTomorrow() } },
    include: { kitchen: true, menuItem: true },
    orderBy: { deliveryDate: "asc" },
  });
}

export interface ApplyActionResult {
  ok: boolean;
  message: string;
}

/**
 * Re-verifies ownership from the caller-supplied userId (the session's own
 * id — never trust an id volunteered by a chat message or an LLM tool-call
 * argument) and, if it checks out, applies the mutation through the exact
 * same domain functions and state machine the account-page buttons use.
 * Same ownership principle as requireOwnSubscriptionId in
 * app/actions/customer.ts.
 */
export async function applyAction(
  userId: string,
  kind: ActionKind,
  subscriptionId: string,
  immediate?: boolean,
): Promise<ApplyActionResult> {
  const sub = await prisma.subscription.findFirst({ where: { id: subscriptionId, userId } });
  if (!sub) {
    return { ok: false, message: "I couldn't find that subscription anymore." };
  }

  try {
    switch (kind) {
      case "pause":
        await pauseSubscription(sub.id, null);
        return { ok: true, message: "Done — your subscription is paused. Say \"resume\" whenever you're ready." };
      case "resume":
        await resumeSubscription(sub.id);
        return { ok: true, message: "Done — your subscription is active again." };
      case "skip":
        await skipDay(sub.id, businessTomorrow());
        return { ok: true, message: "Done — tomorrow's meal is skipped." };
      case "cancel":
        await cancelSubscription(sub.id, immediate ?? false);
        return {
          ok: true,
          message: immediate
            ? "Done — your subscription is cancelled immediately."
            : "Done — your subscription will cancel at the end of the current billing cycle.",
        };
    }
  } catch (error) {
    return { ok: false, message: `Couldn't do that: ${error instanceof Error ? error.message : String(error)}` };
  }
}
