// Deterministic, keyword-based intent parsing for the account-page chat
// assistant. No LLM involved (see docs/design.md) — a fixed set of intents
// matched by substring, in priority order, so behavior is fully predictable
// and testable without mocking anything. Kitchen disambiguation (when a
// customer has more than one subscription) and actually executing an intent
// both happen in app/actions/assistant.ts, which has DB access; this module
// stays pure so it can be unit-tested the same way stateMachine.ts and
// resolveMenuItem.ts are.

export type Intent =
  | { type: "help" }
  | { type: "list_subscriptions" }
  | { type: "next_delivery" }
  | { type: "dietary_preference" }
  | { type: "pause" }
  | { type: "resume" }
  | { type: "skip_tomorrow" }
  | { type: "cancel"; immediate: boolean }
  | { type: "unknown" };

function includesAny(text: string, needles: readonly string[]): boolean {
  return needles.some((needle) => text.includes(needle));
}

/**
 * Parses a raw chat message into an Intent. Order matters: more specific
 * keywords are checked before more general ones (e.g. "cancel" is checked
 * before "status" so "cancel my subscription" doesn't match the status
 * intent just because it contains "subscription").
 */
export function parseIntent(message: string): Intent {
  const text = message.trim().toLowerCase();

  if (includesAny(text, ["help", "what can you do"])) {
    return { type: "help" };
  }
  if (text.includes("cancel")) {
    const immediate = includesAny(text, ["immediate", "right away", "now", "asap"]);
    return { type: "cancel", immediate };
  }
  if (includesAny(text, ["resume", "unpause", "restart"])) {
    return { type: "resume" };
  }
  if (text.includes("pause")) {
    return { type: "pause" };
  }
  if (text.includes("skip")) {
    return { type: "skip_tomorrow" };
  }
  if (includesAny(text, ["deliver", "next meal", "when is my food", "when's my food"])) {
    return { type: "next_delivery" };
  }
  if (includesAny(text, ["diet", "jain", "veg", "onion"])) {
    return { type: "dietary_preference" };
  }
  if (includesAny(text, ["status", "subscription", "my plan", "kitchens"])) {
    return { type: "list_subscriptions" };
  }

  return { type: "unknown" };
}

const AFFIRMATIVE = ["yes", "y", "yeah", "yep", "confirm", "sure", "do it", "ok", "okay"];
const NEGATIVE = ["no", "n", "nope", "nevermind", "never mind", "cancel that", "stop"];

/** Used only when a pendingAction is awaiting confirmation — see app/actions/assistant.ts. */
export function isAffirmative(message: string): boolean {
  const text = message.trim().toLowerCase();
  return AFFIRMATIVE.some((word) => text === word || text.startsWith(`${word} `));
}

export function isNegative(message: string): boolean {
  const text = message.trim().toLowerCase();
  return NEGATIVE.some((word) => text === word || text.startsWith(`${word} `));
}
