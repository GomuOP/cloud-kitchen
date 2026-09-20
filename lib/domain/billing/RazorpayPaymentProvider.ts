import { createHmac, timingSafeEqual } from "node:crypto";
import Razorpay from "razorpay";
import type {
  CreateOrderInput,
  CreateOrderResult,
  PaymentProvider,
  RefundInput,
  RefundResult,
  VerifyPaymentInput,
  VerifyPaymentResult,
} from "./PaymentProvider";

/**
 * Real Razorpay integration, meant to run in test mode (test API keys —
 * see DEPLOY.md). Checkout happens client-side (Razorpay's Checkout.js
 * widget); this class only ever talks to the two things that must happen
 * server-side: creating the order the widget checks out against, and
 * verifying the signature Razorpay hands back afterward. Trusting a
 * client-supplied "it succeeded" without verifying the signature would let
 * anyone fabricate a successful payment.
 */
export class RazorpayPaymentProvider implements PaymentProvider {
  readonly name = "razorpay" as const;
  private readonly client: Razorpay;

  constructor(
    private readonly keyId: string,
    private readonly keySecret: string,
  ) {
    this.client = new Razorpay({ key_id: keyId, key_secret: keySecret });
  }

  async createOrder(input: CreateOrderInput): Promise<CreateOrderResult> {
    const order = await this.client.orders.create({
      amount: input.amountPaise,
      currency: "INR",
      receipt: input.receipt,
    });
    return { orderId: order.id, publicKeyId: this.keyId };
  }

  async verifyPayment(input: VerifyPaymentInput): Promise<VerifyPaymentResult> {
    const expected = createHmac("sha256", this.keySecret)
      .update(`${input.orderId}|${input.paymentId}`)
      .digest("hex");

    const providedBuf = Buffer.from(input.signature);
    const expectedBuf = Buffer.from(expected);
    const signatureValid =
      providedBuf.length === expectedBuf.length && timingSafeEqual(providedBuf, expectedBuf);

    if (!signatureValid) {
      return { status: "failed", providerRef: input.paymentId };
    }

    // Signature proves the payload wasn't tampered with; fetching the
    // payment confirms Razorpay itself actually captured it, rather than
    // trusting a signed-but-stale or since-refunded payment.
    const payment = await this.client.payments.fetch(input.paymentId);
    const captured = payment.status === "captured";

    return { status: captured ? "success" : "failed", providerRef: input.paymentId };
  }

  async refund(input: RefundInput): Promise<RefundResult> {
    const refund = await this.client.payments.refund(input.providerRef, {
      amount: input.amountPaise,
    });
    return { status: "success", refundRef: refund.id };
  }
}
