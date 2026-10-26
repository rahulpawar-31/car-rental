import { z } from "zod";
import { nonEmptyString } from "./common.js";

// Public endpoint that sends an email to the site owner, so every field is length-capped and the
// subject (which becomes an email header) must be a single line.
export const submitContactBody = z.object({
  name: nonEmptyString("name", 100),
  email: nonEmptyString("email", 254).pipe(z.email("email is not a valid email address")),
  subject: nonEmptyString("subject", 200).refine((v) => !/[\r\n]/.test(v), "subject must be a single line"),
  message: nonEmptyString("message", 5000),
});
