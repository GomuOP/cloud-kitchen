"use client";

import { useState } from "react";
import { sendAssistantMessage, type PendingAction } from "@/app/actions/assistant";

interface ChatMessage {
  role: "user" | "bot";
  text: string;
}

const GREETING: ChatMessage = {
  role: "bot",
  text: "Hi! Ask me about your deliveries, or say things like \"pause\", \"skip tomorrow\", or \"cancel\".",
};

// Rendered once in the root layout, only when a customer session exists (see
// app/layout.tsx) — a floating launcher any page can tap, rather than a
// widget embedded on one page. State lives in this component's own React
// state, so it resets on a full page navigation/reload (see docs/design.md
// Phase 6 — no chat-history table yet, smallest thing that works).
export default function FloatingChat() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([GREETING]);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const text = input.trim();
    if (!text || sending) return;

    const nextHistory = [...messages, { role: "user" as const, text }];
    setMessages(nextHistory);
    setInput("");
    setSending(true);

    try {
      const result = await sendAssistantMessage(nextHistory, pendingAction);
      setPendingAction(result.pendingAction);
      setMessages((prev) => [...prev, { role: "bot", text: result.reply }]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: "bot", text: `Something went wrong: ${err instanceof Error ? err.message : String(err)}` },
      ]);
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      {open && (
        <div className="card chat-panel">
          <div className="chat-panel-header">
            <h2>Ask the assistant</h2>
            <button
              type="button"
              className="chat-close"
              aria-label="Close chat"
              onClick={() => setOpen(false)}
            >
              ×
            </button>
          </div>
          <div className="chat-messages">
            {messages.map((m, i) => (
              <div key={i} className={`chat-bubble ${m.role}`}>
                {m.text.split("\n").map((line, j) => (
                  <span key={j}>
                    {line}
                    {j < m.text.split("\n").length - 1 && <br />}
                  </span>
                ))}
              </div>
            ))}
            {sending && <div className="chat-bubble bot muted">…</div>}
          </div>
          <form className="chat-input-row" onSubmit={handleSubmit}>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="e.g. when's my next delivery?"
              disabled={sending}
              autoFocus
            />
            <button type="submit" disabled={sending || !input.trim()}>Send</button>
          </form>
        </div>
      )}
      <button
        type="button"
        className="chat-fab"
        aria-label={open ? "Close chat" : "Ask the assistant"}
        onClick={() => setOpen((o) => !o)}
      >
        {open ? "×" : "💬"}
      </button>
    </>
  );
}
