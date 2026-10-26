import { z } from "zod";
import { parseValidDate } from "../utils/date.utils.js";

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

// null and "" mean "not provided" to the controllers (`x && ...`, `x || default`), so
// optional fields treat them like undefined instead of failing the inner schema.
export const optionalField = (schema) =>
  z.preprocess((v) => (v === null || v === "" ? undefined : v), schema.optional());

// A date the client sent: a non-blank string or a finite timestamp that parses to a real
// instant. Same rule as parseValidDate, so a bad date fails here rather than as NaN pricing.
export const dateInput = (name, max = 50) =>
  z
    .union([nonEmptyString(name, max), z.number().finite()], { error: required(name) })
    .refine((v) => parseValidDate(v) !== null, { error: `${name} is not a valid date` });

// Plain decimal numbers only: unlike z.coerce.number(), "0x10", "1e3", true and [5] are
// not silently turned into numbers. A blank string counts as "not provided".
const parseNumber = (v) => {
  if (typeof v !== "string") return v;
  const s = v.trim();
  if (s === "") return undefined;
  return /^[+-]?\d+(\.\d+)?$/.test(s) ? Number(s) : v;
};

export const numberInput = (name) => z.preprocess(parseNumber, z.number({ error: `${name} must be a number` }));

export const pagination = {
  page: z.preprocess(
    parseNumber,
    z.number({ error: "page must be a number" }).int().min(1, "page must be at least 1").default(1)
  ),
  limit: z.preprocess(
    parseNumber,
    z
      .number({ error: "limit must be a number" })
      .int()
      .min(1, "limit must be at least 1")
      .max(100, "limit must be at most 100")
      .default(10)
  ),
};
