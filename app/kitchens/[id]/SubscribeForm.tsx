"use client";

import { useState } from "react";
import Script from "next/script";
import { createSignupOrderAction, finalizeSignupAction, type SubscribeFormValues } from "@/app/actions/customer";

declare global {
  interface Window {
    // Razorpay's Checkout.js widget — untyped third-party global, not our code.
    Razorpay: new (options: Record<string, unknown>) => { open: () => void };
  }
}

interface PlanOption {
  id: string;
  label: string;
}

export function SubscribeForm({
  plans,
  areas,
  defaultAreaId,
}: {
  plans: PlanOption[];
  areas: { id: string; name: string }[];
  defaultAreaId: string;
}) {
  const [status, setStatus] = useState<"idle" | "creating-order" | "awaiting-payment" | "finalizing">("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(formEvent: React.FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    setError(null);

    const form = formEvent.currentTarget;
    const formData = new FormData(form);
    const values: SubscribeFormValues = {
      planId: String(formData.get("planId")),
      dietaryPreference: String(formData.get("dietaryPreference")) as SubscribeFormValues["dietaryPreference"],
      address: {
        line1: String(formData.get("line1")),
        line2: String(formData.get("line2") ?? "") || undefined,
        areaId: String(formData.get("areaId")),
        pincode: String(formData.get("pincode")),
      },
    };

    try {
      setStatus("creating-order");
      const { order, signupInput } = await createSignupOrderAction(values);

      if (order.provider === "mock") {
        // No real gateway configured — skip the checkout widget entirely
        // and finalize immediately. A short delay so the state genuinely
        // shows in the UI rather than flashing.
        setStatus("awaiting-payment");
        await new Promise((resolve) => setTimeout(resolve, 500));
        setStatus("finalizing");
        const result = await finalizeSignupAction(signupInput, { orderId: order.orderId, paymentId: "mock", signature: "mock" });
        if (!result.ok) {
          setStatus("idle");
          setError(result.error);
        }
        return;
      }

      setStatus("awaiting-payment");
      const razorpay = new window.Razorpay({
        key: order.publicKeyId,
        amount: order.amountPaise,
        currency: "INR",
        order_id: order.orderId,
        name: "The Tiffin Tribe",
        description: "Subscription payment (test mode)",
        theme: { color: "#c2560f" },
        handler: async (response: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
          setStatus("finalizing");
          const result = await finalizeSignupAction(signupInput, {
            orderId: response.razorpay_order_id,
            paymentId: response.razorpay_payment_id,
            signature: response.razorpay_signature,
          });
          if (!result.ok) {
            setStatus("idle");
            setError(result.error);
          }
        },
        modal: {
          ondismiss: () => setStatus("idle"),
        },
      });
      razorpay.open();
    } catch (err) {
      setStatus("idle");
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  const busy = status !== "idle";

  return (
    <>
      <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="lazyOnload" />
      <form onSubmit={handleSubmit}>
        <label>
          Plan
          <select name="planId" required disabled={busy}>
            {plans.map((plan) => (
              <option key={plan.id} value={plan.id}>{plan.label}</option>
            ))}
          </select>
        </label>
        <label>
          Dietary preference
          <select name="dietaryPreference" required defaultValue="veg" disabled={busy}>
            <option value="veg">Veg</option>
            <option value="jain">Jain</option>
            <option value="no_onion_garlic">No onion / garlic</option>
          </select>
        </label>
        <label>
          Address line 1
          <input name="line1" required disabled={busy} />
        </label>
        <label>
          Address line 2 (optional)
          <input name="line2" disabled={busy} />
        </label>
        <label>
          Area
          <select name="areaId" required defaultValue={defaultAreaId} disabled={busy}>
            {areas.map((area) => (
              <option key={area.id} value={area.id}>{area.name}</option>
            ))}
          </select>
        </label>
        <label>
          Pincode
          <input name="pincode" required disabled={busy} />
        </label>

        {error && <p className="error">{error}</p>}

        <button type="submit" disabled={busy}>
          {status === "idle" && "Subscribe"}
          {status === "creating-order" && "Creating order…"}
          {status === "awaiting-payment" && "Waiting for payment…"}
          {status === "finalizing" && "Confirming…"}
        </button>
      </form>
    </>
  );
}
