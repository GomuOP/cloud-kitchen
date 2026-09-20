import type { PaymentProvider } from "./PaymentProvider";
import { MockPaymentProvider } from "./MockPaymentProvider";
import { RazorpayPaymentProvider } from "./RazorpayPaymentProvider";

let cached: PaymentProvider | undefined;

/**
 * Razorpay test mode if RAZORPAY_KEY_ID/RAZORPAY_KEY_SECRET are set, else
 * the mock — so the app (and its tests) work with zero external
 * dependencies out of the box, and upgrade to a real interactive checkout
 * the moment you drop in free Razorpay test credentials. See DEPLOY.md.
 */
export function getPaymentProvider(): PaymentProvider {
  if (cached) return cached;

  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;

  cached =
    keyId && keySecret ? new RazorpayPaymentProvider(keyId, keySecret) : new MockPaymentProvider();
  return cached;
}
