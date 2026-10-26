import { z } from "zod";
import { booleanInput, nonEmptyString, numberInput, optionalField, withoutUndefined } from "./common.js";

const text = (name, max) => z.string({ error: `${name} must be text` }).trim().max(max, `${name} must be at most ${max} characters`);
const queryText = (name, max = 100) => optionalField(z.string({ error: `${name} must be a single value` }).max(max, `${name} is too long`));

export const listLocationsQuery = z.object({
  city: queryText("city"),
  search: queryText("search"),
  active: optionalField(z.enum(["true", "false"], { error: "active must be true or false" })),
});

const hhmm = (name) => z.string({ error: `${name} must be a time like 08:00` }).regex(/^([01]\d|2[0-3]):[0-5]\d$/, `${name} must be a time like 08:00`);

const operatingHours = z.object({
  open: optionalField(hhmm("open")),
  close: optionalField(hhmm("close")),
  is24Hours: optionalField(booleanInput("is24Hours")),
  workingDays: optionalField(
    z.array(z.enum(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"], { error: "workingDays must be weekday names like Mon" }), {
      error: "workingDays must be a list",
    })
  ),
});

const coordinates = z.object({
  lat: optionalField(numberInput("lat").pipe(z.number().min(-90, "lat must be between -90 and 90").max(90, "lat must be between -90 and 90"))),
  lng: optionalField(numberInput("lng").pipe(z.number().min(-180, "lng must be between -180 and 180").max(180, "lng must be between -180 and 180"))),
});

// "" is a valid way to clear a contact field (the admin form sends it), so these keep it.
const optionalEmail = z.union([z.literal(""), z.email("email is not a valid email address").max(254)]);

// Only these fields reach the model. Everything else (carCount, timestamps, ...) is dropped,
// where the controller used to pass the whole request body to Mongoose.
const locationFields = {
  name: nonEmptyString("name", 100),
  city: nonEmptyString("city", 100),
  state: nonEmptyString("state", 100),
  address: nonEmptyString("address", 300),
  country: nonEmptyString("country", 100),
  zipCode: text("zipCode", 20),
  coordinates,
  phone: text("phone", 30),
  email: optionalEmail,
  image: text("image", 500),
  operatingHours,
  isActive: booleanInput("isActive"),
  isPickupAvailable: booleanInput("isPickupAvailable"),
  isDropAvailable: booleanInput("isDropAvailable"),
  airportLocation: booleanInput("airportLocation"),
};

const required = ["name", "city", "state", "address"];
const clearable = ["zipCode", "phone", "email", "image"];

const build = (isRequired) =>
  Object.fromEntries(
    Object.entries(locationFields).map(([key, schema]) => {
      if (isRequired(key)) return [key, schema];
      return [key, clearable.includes(key) ? schema.optional() : optionalField(schema)];
    })
  );

export const createLocationBody = z.object(build((k) => required.includes(k))).transform(withoutUndefined);
export const updateLocationBody = z.object(build(() => false)).transform(withoutUndefined);
