import { loadSubscriptions, getNextDelivery, describeSub, fmtDate, applyAction, type ActionKind } from "./subscriptionOps";

// LLM-backed assistant backend, used instead of the deterministic
// intent.ts/app/actions/assistant.ts path when OPENROUTER_API_KEY is set —
// same "real provider if configured, otherwise the free/local fallback"
// pattern as getPaymentProvider() (Razorpay vs the mock). See
// docs/design.md "Phase 7" for why OpenRouter rather than the Claude API:
// the user wanted a free model, and Anthropic's API has no standing free
// tier, while OpenRouter hosts several ":free" models (here, NVIDIA's
// Nemotron 3.5 Lightning) that support OpenAI-compatible tool calling at
// no cost, rate-limited rather than metered.

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const MODEL = "nvidia/nemotron-3.5-lightning:free";
const MAX_TOOL_ITERATIONS = 6;

export function isLlmAssistantConfigured(): boolean {
  return !!process.env.OPENROUTER_API_KEY;
}

export interface ChatTurn {
  role: "user" | "bot";
  text: string;
}

const SYSTEM_PROMPT = `You are the customer-support assistant for Cloud Kitchen Subscription, a meal-subscription marketplace. You help a single logged-in customer with their own meal subscriptions only — nothing else (no general knowledge questions, no other customers' data, no platform-wide questions).

Rules:
- Never guess or make up subscription, order, or delivery data. Always call a tool to get real data before answering a factual question.
- The customer may have more than one subscription (different kitchens). If a request is ambiguous about which one, ask which kitchen before doing anything.
- pause_subscription, resume_subscription, skip_tomorrow_meal, and cancel_subscription all make a real change. Never call one of these on the same turn a customer first asks — first explain in plain language exactly what you're about to do (which subscription, and for cancel, whether it's immediate or at cycle end) and wait for them to explicitly confirm (e.g. "yes"). Only call the tool after they've confirmed in a later message.
- Keep replies short and conversational — this is a chat widget, not an email.
- If a tool call fails or reports an error, relay the actual reason to the customer plainly (e.g. a skip cutoff that already passed) rather than a generic apology.`;

interface ToolDef {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, unknown>;
      required?: string[];
      additionalProperties: false;
    };
  };
}

const TOOLS: ToolDef[] = [
  {
    type: "function",
    function: {
      name: "get_subscriptions",
      description: "List the customer's own subscriptions: subscription id, kitchen name, plan name, status, dietary preference, and current cycle end date.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "get_next_delivery",
      description: "Get the customer's next scheduled delivery: date, kitchen, and menu item.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "pause_subscription",
      description: "Pause a subscription indefinitely. Only call after the customer has explicitly confirmed.",
      parameters: {
        type: "object",
        properties: { subscriptionId: { type: "string", description: "From get_subscriptions." } },
        required: ["subscriptionId"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "resume_subscription",
      description: "Resume a paused subscription. Only call after the customer has explicitly confirmed.",
      parameters: {
        type: "object",
        properties: { subscriptionId: { type: "string", description: "From get_subscriptions." } },
        required: ["subscriptionId"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "skip_tomorrow_meal",
      description: "Skip tomorrow's meal for an active subscription. Only call after the customer has explicitly confirmed. Fails if the 8pm IST cutoff for tomorrow has already passed.",
      parameters: {
        type: "object",
        properties: { subscriptionId: { type: "string", description: "From get_subscriptions." } },
        required: ["subscriptionId"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "cancel_subscription",
      description: "Cancel a subscription, either immediately or at the end of the current billing cycle. Only call after the customer has explicitly confirmed which of the two they want.",
      parameters: {
        type: "object",
        properties: {
          subscriptionId: { type: "string", description: "From get_subscriptions." },
          immediate: { type: "boolean", description: "true = cancel right now; false = cancel at the end of the current cycle." },
        },
        required: ["subscriptionId", "immediate"],
        additionalProperties: false,
      },
    },
  },
];

interface OpenRouterMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: Array<{ id: string; type: "function"; function: { name: string; arguments: string } }>;
  tool_call_id?: string;
}

interface OpenRouterResponse {
  choices?: Array<{ message: OpenRouterMessage; finish_reason: string }>;
}

async function callOpenRouter(messages: OpenRouterMessage[]): Promise<{
  message: OpenRouterMessage;
  finishReason: string;
}> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is not set");
  }

  const response = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "X-Title": "Cloud Kitchen Subscription assistant",
    },
    body: JSON.stringify({
      model: MODEL,
      messages,
      tools: TOOLS,
      tool_choice: "auto",
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    if (response.status === 429) {
      throw new Error("The assistant is rate-limited right now (free tier) — please try again in a minute.");
    }
    throw new Error(`OpenRouter request failed (${response.status}): ${body.slice(0, 300)}`);
  }

  const data: OpenRouterResponse = await response.json();
  const choice = data.choices?.[0];
  if (!choice?.message) {
    throw new Error("OpenRouter returned no message");
  }
  return { message: choice.message, finishReason: choice.finish_reason };
}

async function executeTool(name: string, rawArgs: string, userId: string): Promise<unknown> {
  let args: Record<string, unknown>;
  try {
    args = rawArgs ? JSON.parse(rawArgs) : {};
  } catch {
    return { error: "Could not parse tool arguments" };
  }

  switch (name) {
    case "get_subscriptions": {
      const subs = await loadSubscriptions(userId);
      return subs.map((s) => ({
        subscriptionId: s.id,
        kitchen: s.kitchen.name,
        plan: s.plan.name,
        status: s.status,
        dietaryPreference: s.dietaryPreference,
        cycleEnd: fmtDate(s.currentCycleEnd),
        description: describeSub(s),
      }));
    }
    case "get_next_delivery": {
      const order = await getNextDelivery(userId);
      if (!order) return { hasDelivery: false };
      return {
        hasDelivery: true,
        date: fmtDate(order.deliveryDate),
        kitchen: order.kitchen.name,
        item: order.menuItem.name,
      };
    }
    case "pause_subscription":
      return applyAction(userId, "pause", String(args.subscriptionId ?? ""));
    case "resume_subscription":
      return applyAction(userId, "resume", String(args.subscriptionId ?? ""));
    case "skip_tomorrow_meal":
      return applyAction(userId, "skip" as ActionKind, String(args.subscriptionId ?? ""));
    case "cancel_subscription":
      return applyAction(userId, "cancel", String(args.subscriptionId ?? ""), Boolean(args.immediate));
    default:
      return { error: `Unknown tool: ${name}` };
  }
}

export async function runLlmAssistantTurn(userId: string, history: ChatTurn[]): Promise<{ reply: string; mutated: boolean }> {
  const messages: OpenRouterMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...history.map((turn): OpenRouterMessage => ({
      role: turn.role === "user" ? "user" : "assistant",
      content: turn.text,
    })),
  ];

  let mutated = false;

  for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
    const { message, finishReason } = await callOpenRouter(messages);
    messages.push(message);

    if (finishReason !== "tool_calls" || !message.tool_calls?.length) {
      return { reply: message.content ?? "Sorry, I don't have a response for that.", mutated };
    }

    for (const call of message.tool_calls) {
      if (["pause_subscription", "resume_subscription", "skip_tomorrow_meal", "cancel_subscription"].includes(call.function.name)) {
        mutated = true;
      }
      const result = await executeTool(call.function.name, call.function.arguments, userId);
      messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result) });
    }
  }

  return { reply: "Sorry, that took too many steps — could you rephrase your request?", mutated };
}
