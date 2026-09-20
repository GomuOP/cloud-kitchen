import { randomUUID } from "node:crypto";
import type {
  CreateOrderInput,
  CreateOrderResult,
  PaymentProvider,
  RefundResult,
  VerifyPaymentInput,
  VerifyPaymentResult,
} from "./PaymentProvider";

/**
 * Deterministic, not random: a receipt ending in ":fail" produces an order
 * that verifyPayment always fails. That makes the failure path (charge
 * fails -> subscription never gets created / renewal enters grace)
 * demoable and unit-testable without flakiness, instead of a coin flip.
 * No real checkout happens — the client skips the payment modal entirely
 * when this provider is active (see SubscribeForm.tsx).
 */
export class MockPaymentProvider implements PaymentProvider {
  readonly name = "mock" as const;

  async createOrder(input: CreateOrderInput): Promise<CreateOrderResult> {
    const outcome = input.receipt.endsWith(":fail") ? "fail" : "ok";
    return { orderId: `mock_order_${outcome}_${randomUUID()}` };
  }

  async verifyPayment(input: VerifyPaymentInput): Promise<VerifyPaymentResult> {
    const status = input.orderId.includes("_fail_") ? "failed" : "success";
    return { status, providerRef: `mock_payment_${randomUUID()}` };
  }

  async refund(): Promise<RefundResult> {
    return { status: "success", refundRef: `mock_refund_${randomUUID()}` };
  }
}
