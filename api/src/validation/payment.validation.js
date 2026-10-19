import { z } from "zod";
import { nonEmptyString, objectId, pagination } from "./common.js";

export const createIntentBody = z.object({
  bookingId: objectId("bookingId"),
});

export const confirmPaymentBody = z.object({
  razorpayPaymentId: nonEmptyString("razorpayPaymentId"),
  razorpayOrderId: nonEmptyString("razorpayOrderId"),
  razorpaySignature: nonEmptyString("razorpaySignature"),
});

export const refundBody = z.object({
  bookingId: objectId("bookingId"),
  reason: z.string().trim().max(500, "reason must be at most 500 characters").optional(),
});

export const listPaymentsQuery = z.object({ ...pagination });
