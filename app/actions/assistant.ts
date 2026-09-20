"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/client";
import { getCustomerUserId } from "@/lib/auth/session";
import { businessTomorrow, isSkipAllowed } from "@/lib/domain/time";
import { canTransition } from "@/lib/domain/subscription/stateMachine";
import { parseIntent, isAffirmative, isNegative } from "@/lib/domain/assistant/intent";
import {
  loadSubscriptions,
  describeSub,
  fmtDate,
  applyAction,
  type ActionKind,
  type SubscriptionWithRelations,
} from "@/lib/domain/assistant/subscriptionOps";
import { isLlmAssistantConfigured, runLlmAssistantTurn, type ChatTurn } from "@/lib/domain/assistant/llmChat";

// Two backends, same pattern as getPaymentProvider() (real Razorpay if keys
// are configured, otherwise a mock): if OPENROUTER_API_KEY is set, chat is
// handled by an actual LLM with tool calling (lib/domain/assistant/
// llmChat.ts); otherwise it falls back to this file's deterministic,
// keyword-based flow (lib/domain/assistant/intent.ts) so the assistant
// still works with zero external dependencies. See docs/design.md
// "Phase 6" (rule-based) and "Phase 7" (LLM backend).
//
// Every mutation, on either backend, goes through applyAction() in
// subscriptionOps.ts — the exact same domain functions and state machine
// the account-page buttons use. Nothing here bypasses a business rule
// (skip cutoff, legal-transition check) that the buttons enforce.

export type PendingAction =
  | { stage: "confirm"; subscriptionId: string; kind: ActionKind; immediate?: boolean }
  | { stage: "disambiguate"; kind: ActionKind; immediate?: boolean; candidateIds: string[] };

export interface AssistantTurnResult {
  reply: string;
  pendingAction: PendingAction | null;
}

const HELP_TEXT =
  "I can tell you about your subscriptions, your next delivery, or your dietary preference, " +
  "and I can pause, resume, skip tomorrow's meal, or cancel a subscription — just ask " +
  "(e.g. \"pause my subscription\" or \"skip tomorrow\"). I'll always confirm before changing anything.";

function candidatesFor(kind: ActionKind, subs: SubscriptionWithRelations[]): SubscriptionWithRelations[] {
  switch (kind) {
    case "pause":
      return subs.filter((s) => canTransition(s.status, "PAUSE"));
    case "resume":
      return subs.filter((s) => canTransition(s.status, "RESUME"));
    case "cancel":
      return subs.filter((s) => canTransition(s.status, "CANCEL"));
    case "skip":
      return subs.filter((s) => s.status === "active");
  }
}

function noCandidatesMessage(kind: ActionKind): string {
  switch (kind) {
    case "pause":
      return "You don't have a subscription that can be paused right now.";
    case "resume":
      return "You don't have a paused subscription to resume.";
    case "cancel":
      return "You don't have a subscription that can be cancelled right now.";
    case "skip":
      return "You don't have an active subscription to skip a meal for.";
  }
}

function confirmQuestion(kind: ActionKind, sub: SubscriptionWithRelations, immediate?: boolean): string {
  switch (kind) {
    case "pause":
      return `Pause your subscription with ${describeSub(sub)}? Reply "yes" to confirm.`;
    case "resume":
      return `Resume your subscription with ${describeSub(sub)}? Reply "yes" to confirm.`;
    case "skip":
      return `Skip tomorrow's (${fmtDate(businessTomorrow())}) meal from ${sub.kitchen.name}? Reply "yes" to confirm.`;
    case "cancel":
      return immediate
        ? `Cancel your subscription with ${describeSub(sub)} immediately? This stops delivery right away. Reply "yes" to confirm.`
        : `Cancel your subscription with ${describeSub(sub)} at the end of the current billing cycle (${fmtDate(sub.currentCycleEnd)})? Reply "yes" to confirm.`;
  }
}

function beginAction(kind: ActionKind, subs: SubscriptionWithRelations[], immediate?: boolean): AssistantTurnResult {
  const candidates = candidatesFor(kind, subs);

  if (candidates.length === 0) {
    return { reply: noCandidatesMessage(kind), pendingAction: null };
  }

  if (kind === "skip" && !isSkipAllowed(businessTomorrow())) {
    return { reply: "The skip cutoff (8pm IST the day before) has already passed for tomorrow.", pendingAction: null };
  }

  if (candidates.length === 1) {
    const sub = candidates[0];
    return {
      reply: confirmQuestion(kind, sub, immediate),
      pendingAction: { stage: "confirm", subscriptionId: sub.id, kind, immediate },
    };
  }

  const names = candidates.map((s) => s.kitchen.name).join(", ");
  return {
    reply: `You have more than one — which kitchen? (${names})`,
    pendingAction: { stage: "disambiguate", kind, immediate, candidateIds: candidates.map((s) => s.id) },
  };
}

async function runRuleBasedTurn(
  userId: string,
  message: string,
  pendingAction: PendingAction | null,
): Promise<AssistantTurnResult> {
  const subscriptions = await loadSubscriptions(userId);

  if (pendingAction?.stage === "confirm") {
    if (isAffirmative(message)) {
      const result = await applyAction(userId, pendingAction.kind, pendingAction.subscriptionId, pendingAction.immediate);
      revalidatePath("/account");
      return { reply: result.message, pendingAction: null };
    }
    if (isNegative(message)) {
      return { reply: "Okay, I didn't change anything.", pendingAction: null };
    }
    const sub = subscriptions.find((s) => s.id === pendingAction.subscriptionId);
    return {
      reply: `Please reply "yes" or "no". ${sub ? confirmQuestion(pendingAction.kind, sub, pendingAction.immediate) : ""}`,
      pendingAction,
    };
  }

  if (pendingAction?.stage === "disambiguate") {
    const normalized = message.trim().toLowerCase();
    const candidates = subscriptions.filter((s) => pendingAction.candidateIds.includes(s.id));
    const match = candidates.find((s) => normalized.includes(s.kitchen.name.toLowerCase()));

    if (!match) {
      const names = candidates.map((s) => s.kitchen.name).join(", ");
      return { reply: `Sorry, I didn't catch which one. Which kitchen — ${names}?`, pendingAction };
    }

    return {
      reply: confirmQuestion(pendingAction.kind, match, pendingAction.immediate),
      pendingAction: { stage: "confirm", subscriptionId: match.id, kind: pendingAction.kind, immediate: pendingAction.immediate },
    };
  }

  const intent = parseIntent(message);

  switch (intent.type) {
    case "help":
      return { reply: HELP_TEXT, pendingAction: null };

    case "list_subscriptions": {
      if (subscriptions.length === 0) {
        return { reply: "You don't have any subscriptions yet — browse kitchens to get started.", pendingAction: null };
      }
      const lines = subscriptions.map((s) => `- ${describeSub(s)}, cycle ends ${fmtDate(s.currentCycleEnd)}`);
      return { reply: `Here's what you have:\n${lines.join("\n")}`, pendingAction: null };
    }

    case "next_delivery": {
      const order = await prisma.order.findFirst({
        where: { subscription: { userId }, deliveryDate: { gte: businessTomorrow() } },
        include: { kitchen: true, menuItem: true },
        orderBy: { deliveryDate: "asc" },
      });
      if (!order) {
        return { reply: "You don't have any upcoming deliveries scheduled yet.", pendingAction: null };
      }
      return {
        reply: `Your next delivery is on ${fmtDate(order.deliveryDate)} from ${order.kitchen.name}: ${order.menuItem.name}.`,
        pendingAction: null,
      };
    }

    case "dietary_preference": {
      if (subscriptions.length === 0) {
        return { reply: "You don't have any subscriptions yet.", pendingAction: null };
      }
      const lines = subscriptions.map((s) => `- ${s.kitchen.name}: ${s.dietaryPreference}`);
      return { reply: `Your dietary preference:\n${lines.join("\n")}`, pendingAction: null };
    }

    case "pause":
      return beginAction("pause", subscriptions);
    case "resume":
      return beginAction("resume", subscriptions);
    case "skip_tomorrow":
      return beginAction("skip", subscriptions);
    case "cancel":
      return beginAction("cancel", subscriptions, intent.immediate);

    case "unknown":
    default:
      return { reply: "Sorry, I didn't understand that. Say \"help\" to see what I can do.", pendingAction: null };
  }
}

export async function sendAssistantMessage(
  history: ChatTurn[],
  pendingAction: PendingAction | null,
): Promise<AssistantTurnResult> {
  const userId = await getCustomerUserId();
  if (!userId) redirect("/login");

  if (isLlmAssistantConfigured()) {
    // The LLM path drives confirmation through the conversation transcript
    // itself (see the system prompt in llmChat.ts), so it doesn't use the
    // rule-based path's explicit PendingAction state machine.
    try {
      const { reply, mutated } = await runLlmAssistantTurn(userId, history);
      if (mutated) revalidatePath("/account");
      return { reply, pendingAction: null };
    } catch (error) {
      // A thrown Error here would be redacted in a production build (see
      // docs/design.md Phase 4) — an upstream LLM/network hiccup is an
      // expected operational failure for a chat feature, not a bug, so it's
      // returned as a reply rather than thrown.
      return {
        reply: `Sorry, I'm having trouble reaching the assistant right now (${error instanceof Error ? error.message : String(error)}).`,
        pendingAction: null,
      };
    }
  }

  const lastMessage = history[history.length - 1]?.text ?? "";
  return runRuleBasedTurn(userId, lastMessage, pendingAction);
}
