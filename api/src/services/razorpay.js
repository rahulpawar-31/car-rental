import crypto from "crypto";
import Razorpay from "razorpay";

let razorpay;

// Constructed lazily (not at module load) so this file — and verifyHmacSignature
// in particular — stays importable/testable in environments without Razorpay
// credentials configured. The SDK throws eagerly if key_id is missing.
function getClient() {
  if (!razorpay) {
    razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });
  }
  return razorpay;
}

/**
 * Constant-time HMAC-SHA256 signature check, shared by both payment
 * confirmation and webhook verification (previously duplicated inline in
 * each, both using a non-constant-time `!==` comparison — a timing
 * side-channel on a security-sensitive check). Returns false rather than
 * throwing when the signature is missing or a different length than a
 * real digest, instead of letting crypto.timingSafeEqual reject those.
 *
 * @param {string|Buffer} data - the exact payload that was signed
 * @param {string} secret
 * @param {string|undefined} signature - hex-encoded HMAC to check
 */
export function verifyHmacSignature(data, secret, signature) {
  const expected = crypto.createHmac("sha256", secret).update(data).digest("hex");

  const expectedBuf = Buffer.from(expected);
  const signatureBuf = Buffer.from(String(signature ?? ""));
  if (expectedBuf.length !== signatureBuf.length) return false;

  return crypto.timingSafeEqual(expectedBuf, signatureBuf);
}

/**
 * Verifies the signature Razorpay returns to the client after checkout,
 * confirming the orderId/paymentId pair wasn't tampered with. Signed with
 * RAZORPAY_KEY_SECRET over `orderId|paymentId`, per Razorpay's checkout spec.
 */
export function verifyPaymentSignature(orderId, paymentId, signature) {
  return verifyHmacSignature(`${orderId}|${paymentId}`, process.env.RAZORPAY_KEY_SECRET, signature);
}

/**
 * Verifies the `X-Razorpay-Signature` header on an incoming webhook call,
 * signed with the separate RAZORPAY_WEBHOOK_SECRET over the raw request body.
 */
export function verifyWebhookSignature(rawBody, signature) {
  return verifyHmacSignature(rawBody, process.env.RAZORPAY_WEBHOOK_SECRET, signature);
}

/** Creates a Razorpay order for a booking's total amount (in paise). */
export function createOrder({ amount, currency, receipt, notes }) {
  return getClient().orders.create({ amount, currency, receipt, notes });
}

/** Refunds a captured Razorpay payment (amount in paise). */
export function refundPaymentGateway(paymentId, { amount, notes }) {
  return getClient().payments.refund(paymentId, { amount, notes });
}
