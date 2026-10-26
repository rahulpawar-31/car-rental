import { z } from "zod";
import { dateInput, nonEmptyString, objectId } from "./common.js";

// Optional free text. "" is kept: the profile form sends "" for an emptied field, which is how a
// user clears it.
const text = (name, max) =>
  z.string({ error: `${name} must be text` }).trim().max(max, `${name} must be at most ${max} characters`).optional();

const address = z.object({
  street: text("street", 200),
  city: text("city", 100),
  state: text("state", 100),
  country: text("country", 100),
  zipCode: text("zipCode", 20),
});

export const updateProfileBody = z.object({
  name: nonEmptyString("name", 100).optional(),
  phone: text("phone", 20),
  address: address.optional(),
});

// The current password is only compared, never judged against policy, so accounts created under
// any older rule can still change it. The new one follows the user model's minimum.
export const changePasswordBody = z.object({
  currentPassword: z.string({ error: "currentPassword is required" }).min(1, "currentPassword is required").max(1000, "currentPassword is too long"),
  newPassword: z
    .string({ error: "newPassword is required" })
    .min(8, "newPassword must be at least 8 characters")
    .max(128, "newPassword must be at most 128 characters"),
});

export const savedCarParams = z.object({ carId: objectId("carId") });
export const savedLocationParams = z.object({ locationId: objectId("locationId") });

// Multipart: the licence image is parsed by multer, the text fields arrive here. Both are optional
// (a request may carry only the image); "" clears a field.
export const drivingLicenseBody = z.object({
  number: text("number", 50),
  expiryDate: z.union([z.literal(""), dateInput("expiryDate")], { error: "expiryDate is not a valid date" }).optional(),
});
