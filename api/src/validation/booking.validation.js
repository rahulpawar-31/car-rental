import { z } from "zod";
import { nonEmptyString, objectId, pagination } from "./common.js";

const rentalType = z.enum(["day", "hour", "airport"], { error: "rentalType must be day, hour or airport" });
const totalHours = z.coerce.number({ error: "totalHours must be a number" }).positive("totalHours must be positive");

// Only the fields the Booking model stores are kept; anything else a client sends is dropped.
const driverDetails = z.object({
  name: z.string().trim().max(100).optional(),
  phone: z.string().trim().max(30).optional(),
  licenseNumber: z.string().trim().max(50).optional(),
  licenseExpiry: z.string().trim().max(50).optional(),
});

export const createBookingBody = z.object({
  carId: objectId("carId"),
  pickupLocationId: objectId("pickupLocationId").optional(),
  dropLocationId: objectId("dropLocationId").optional(),
  pickupDate: nonEmptyString("pickupDate", 50),
  dropDate: nonEmptyString("dropDate", 50),
  couponCode: z.string().trim().max(50).optional(),
  driverDetails: driverDetails.optional(),
  notes: z.string().max(1000, "notes must be at most 1000 characters").optional(),
  rentalType: rentalType.optional(),
  totalHours: totalHours.optional(),
});

export const applyCouponBody = z.object({
  code: nonEmptyString("code", 50),
  carId: objectId("carId"),
  pickupDate: nonEmptyString("pickupDate", 50),
  dropDate: z.string().trim().max(50).optional(),
  rentalType: rentalType.optional(),
  totalHours: totalHours.optional(),
});

export const cancelBookingBody = z.object({
  reason: z.string().trim().max(500, "reason must be at most 500 characters").optional(),
});

export const rescheduleBookingBody = z.object({
  pickupDate: nonEmptyString("pickupDate", 50),
  dropDate: nonEmptyString("dropDate", 50),
});

export const listBookingsQuery = z.object({
  ...pagination,
  status: z.string().trim().max(30).optional(),
});
