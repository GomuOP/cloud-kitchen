// Behind this interface sits a real gateway (Razorpay, test mode) or the
// mock, chosen by getPaymentProvider() based on whether gateway credentials
// are configured. Every amount is integer paise (CLAUDE.md rule 4) — never
// a float.
//
// Shaped as create-order / verify-payment / refund because that's what a
// real interactive card/UPI checkout actually requires — there's no
// synchronous "charge now, get a result now" call for a flow that involves
// a human completing a checkout modal. See docs/design.md "Payments" for
// why this forced signup() to change shape.

export interface CreateOrderInput {
  amountPaise: number;
  receipt: string;
}

export interface CreateOrderResult {
  orderId: string;
  /** Public key the client-side checkout widget needs. Undefined for the mock provider. */
  publicKeyId?: string;
}

export interface VerifyPaymentInput {
  orderId: string;
  paymentId: string;
  signature: string;
}

export interface VerifyPaymentResult {
  status: "success" | "failed";
  providerRef: string;
}

export interface RefundInput {
  providerRef: string;
  amountPaise: number;
}

export interface RefundResult {
  status: "success" | "failed";
  refundRef: string;
}

export interface PaymentProvider {
  readonly name: "mock" | "razorpay";
  createOrder(input: CreateOrderInput): Promise<CreateOrderResult>;
  verifyPayment(input: VerifyPaymentInput): Promise<VerifyPaymentResult>;
  refund(input: RefundInput): Promise<RefundResult>;
}
