import { z } from "zod";

const required = (name) => `${name} is required`;

// A string field that must be present and non-blank. Rejects objects/arrays/numbers.
export const nonEmptyString = (name, max = 200) =>
  z
    .string({ error: required(name) })
    .trim()
    .min(1, required(name))
    .max(max, `${name} must be at most ${max} characters`);

export const objectId = (name) =>
  z
    .string({ error: required(name) })
    .regex(/^[0-9a-fA-F]{24}$/, `${name} is not a valid id`);

export const idParams = z.object({ id: objectId("id") });

export const pagination = {
  page: z.coerce.number({ error: "page must be a number" }).int().min(1, "page must be at least 1").default(1),
  limit: z.coerce
    .number({ error: "limit must be a number" })
    .int()
    .min(1, "limit must be at least 1")
    .max(100, "limit must be at most 100")
    .default(10),
};
