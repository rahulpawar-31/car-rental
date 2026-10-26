import { Router } from "express";
import { submitContact } from "../controllers/contact.controller.js";
import { contactLimiter } from "../middleware/rateLimit.middleware.js";
import { validate } from "../middleware/validate.middleware.js";
import { submitContactBody } from "../validation/contact.validation.js";

const router = Router();

// The limiter runs first so malformed submissions still count against the sender's budget.
router.post("/", contactLimiter, validate({ body: submitContactBody }), submitContact);

export default router;
