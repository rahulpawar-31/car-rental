import { Router } from "express";
import { submitContact } from "../controllers/contact.controller.js";
import { validate } from "../middleware/validate.middleware.js";
import { submitContactBody } from "../validation/contact.validation.js";

const router = Router();

router.post("/", validate({ body: submitContactBody }), submitContact);

export default router;
