import { z } from "zod";
import Car from "../model/car.model.js";
import { booleanInput, nonEmptyString, numberInput, objectId, optionalField, withoutUndefined } from "./common.js";

// Enum values come from the model so the two can't drift apart.
const enumFromModel = (path, name) =>
  z.enum(Car.schema.path(path).enumValues, { error: `${name} must be one of: ${Car.schema.path(path).enumValues.join(", ")}` });

export const DOCUMENT_TYPES = ["insurance", "registration", "pollution"];
const docType = z.enum(DOCUMENT_TYPES, { error: "Invalid docType. Use: insurance, registration, pollution" });

// The sort keys car.controller.js's sortOptions understands.
export const CAR_SORTS = ["-createdAt", "price-asc", "price-desc", "rating-desc", "model-asc", "-totalRentals"];

// --- query -----------------------------------------------------------------------------------
// Query values stay strings on purpose: the controller treats "0" as a real value and does its
// own parseInt/parseFloat (and its own "Invalid page parameter" messages), so this only rejects
// repeated/nested params (?type[$ne]=x, ?brand=a&brand=b) and non-numeric numbers. "" counts as
// absent, as it always did (`if (minPrice)`).
const queryText = (name, max = 200) => optionalField(z.string({ error: `${name} must be a single value` }).max(max, `${name} is too long`));
const queryNumber = (name) =>
  optionalField(
    z
      .string({ error: `${name} must be a number` })
      .trim()
      .regex(/^\d+(\.\d+)?$/, `${name} must be a non-negative number`)
  );
const queryFlag = (name) => optionalField(z.enum(["true", "false"], { error: `${name} must be true or false` }));

export const listCarsQuery = z.object({
  page: queryText("page", 10),
  // Capped like the other list endpoints; the web app never asks for more than 100.
  limit: optionalField(
    z
      .string({ error: "limit must be a single value" })
      .max(10, "limit is too long")
      .refine((v) => !(/^\d+$/.test(v) && Number(v) > 100), "limit must be at most 100")
  ),
  type: queryText("type"),
  brand: queryText("brand"),
  transmission: queryText("transmission", 20),
  fuelType: queryText("fuelType"),
  location: queryText("location", 50),
  minPrice: queryNumber("minPrice"),
  maxPrice: queryNumber("maxPrice"),
  seats: queryNumber("seats"),
  search: queryText("search", 100),
  sort: optionalField(z.enum(CAR_SORTS, { error: `sort must be one of: ${CAR_SORTS.join(", ")}` })),
  available: queryFlag("available"),
  featured: queryFlag("featured"),
  pickupDate: queryText("pickupDate", 50),
  dropDate: queryText("dropDate", 50),
});

// The controller reports a missing date as "Pickup and drop dates required" and parses them itself.
export const carAvailabilityQuery = z.object({
  pickupDate: queryText("pickupDate", 50),
  dropDate: queryText("dropDate", 50),
});

// --- params ----------------------------------------------------------------------------------
export const carImageParams = z.object({ id: objectId("id"), imageId: objectId("imageId") });
export const carDocumentParams = z.object({ id: objectId("id"), docType });

// --- bodies (admin) --------------------------------------------------------------------------
// Only the fields car.controller.js's ALLOWED_CAR_FIELDS keeps are accepted; the rest (images,
// rating, totalRentals, ...) are dropped. Numbers and booleans accept real values or text, since
// the same routes also take multipart forms.
const text = (name, max) => z.string({ error: `${name} must be text` }).trim().max(max, `${name} must be at most ${max} characters`);
const whole = (name, min, max) =>
  numberInput(name).pipe(
    z.number().int(`${name} must be a whole number`).min(min, `${name} must be at least ${min}`).max(max, `${name} must be at most ${max}`)
  );
const money = (name, min) =>
  numberInput(name).pipe(z.number().min(min, `${name} must be at least ${min}`).max(10_000_000, `${name} is too large`));
const features = z.preprocess(
  (v) => (typeof v === "string" ? [v] : v),
  z
    .array(z.string({ error: "features must be text" }).trim().min(1).max(50, "each feature must be at most 50 characters"), {
      error: "features must be a list",
    })
    .max(50, "features can have at most 50 items")
);

const carFields = {
  name: nonEmptyString("name", 100),
  brand: nonEmptyString("brand", 50),
  model: nonEmptyString("model", 50),
  year: whole("year", 1900, 2100),
  type: enumFromModel("type", "type"),
  transmission: enumFromModel("transmission", "transmission"),
  fuelType: enumFromModel("fuelType", "fuelType"),
  seats: whole("seats", 1, 20),
  pricePerDay: money("pricePerDay", 1),
  securityDeposit: money("securityDeposit", 0),
  color: text("color", 50),
  description: text("description", 2000),
  features,
  location: objectId("location"),
  isFeatured: booleanInput("isFeatured"),
  isAvailable: booleanInput("isAvailable"),
  isActive: booleanInput("isActive"),
};

// What the Car model requires, so a create fails with a clear field error instead of a
// Mongoose ValidationError. Blank optional values are dropped.
const required = ["name", "brand", "model", "year", "type", "transmission", "fuelType", "seats", "pricePerDay"];
const createShape = Object.fromEntries(
  Object.entries(carFields).map(([key, schema]) => [key, required.includes(key) ? schema : optionalField(schema)])
);
export const createCarBody = z.object(createShape).transform(withoutUndefined);

// Updates are partial. "" is kept for the free-text fields so an admin can clear them (the form
// sends "" for an emptied field); for everything else it counts as not provided.
const clearable = ["color", "description"];
const updateShape = Object.fromEntries(
  Object.entries(carFields).map(([key, schema]) => [key, clearable.includes(key) ? schema.optional() : optionalField(schema)])
);
export const updateCarBody = z.object(updateShape).transform(withoutUndefined);

export const verifyDocumentParams = carDocumentParams;
export const uploadDocumentBody = z.object({
  expiryDate: optionalField(z.string({ error: "expiryDate must be a date" }).trim().max(50, "expiryDate is too long")),
});
