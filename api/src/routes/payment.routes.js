import { Router } from "express";
import {
  createPaymentIntent,
  confirmPayment,
  getPaymentHistory,
  razorpayWebhook,
  refundPayment,
} from "../controllers/payment.controller.js";
import { protect, authorize } from "../middleware/auth.middleware.js";
import { validate } from "../middleware/validate.middleware.js";
import {
  createIntentBody,
  confirmPaymentBody,
  refundBody,
  listPaymentsQuery,
} from "../validation/payment.validation.js";

const router = Router();

router.post("/webhook", razorpayWebhook);

router.use(protect);
router.post("/create-intent", validate({ body: createIntentBody }), createPaymentIntent);
router.post("/confirm", validate({ body: confirmPaymentBody }), confirmPayment);
router.get("/history", validate({ query: listPaymentsQuery }), getPaymentHistory);

router.post("/refund", authorize("admin"), validate({ body: refundBody }), refundPayment);

export default router;
