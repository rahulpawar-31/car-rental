import { z } from "zod";
import { dateInput, nonEmptyString, numberInput, objectId, optionalField, pagination } from "./common.js";

const rentalType = z.enum(["day", "hour", "airport"], { error: "rentalType must be day, hour or airport" });
// Hourly rentals are capped at 30 days; longer trips are daily rentals. Also bounds the pricing math.
const totalHours = numberInput("totalHours")
  .pipe(z.number().positive("totalHours must be positive").max(720, "totalHours must be at most 720"));

// Only the fields the Booking model stores are kept; anything else a client sends is dropped.
const driverDetails = z.object({
  name: optionalField(z.string().trim().max(100)),
  phone: optionalField(z.string().trim().max(30)),
  licenseNumber: optionalField(z.string().trim().max(50)),
  licenseExpiry: optionalField(dateInput("licenseExpiry")),
});

export const createBookingBody = z.object({
  carId: objectId("carId"),
  pickupLocationId: optionalField(objectId("pickupLocationId")),
  dropLocationId: optionalField(objectId("dropLocationId")),
  pickupDate: dateInput("pickupDate"),
  dropDate: dateInput("dropDate"),
  couponCode: optionalField(z.string().trim().max(50)),
  driverDetails: optionalField(driverDetails),
  notes: optionalField(z.string().max(1000, "notes must be at most 1000 characters")),
  rentalType: optionalField(rentalType),
  totalHours: optionalField(totalHours),
});

export const applyCouponBody = z.object({
  code: nonEmptyString("code", 50),
  carId: objectId("carId"),
  pickupDate: dateInput("pickupDate"),
  dropDate: optionalField(dateInput("dropDate")),
  rentalType: optionalField(rentalType),
  totalHours: optionalField(totalHours),
});

export const cancelBookingBody = z.object({
  reason: optionalField(z.string().trim().max(500, "reason must be at most 500 characters")),
});

export const rescheduleBookingBody = z.object({
  pickupDate: dateInput("pickupDate"),
  dropDate: dateInput("dropDate"),
});

export const listBookingsQuery = z.object({
  ...pagination,
  status: z.string().trim().max(30).optional(),
});
