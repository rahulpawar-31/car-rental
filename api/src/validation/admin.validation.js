import { z } from "zod";
import Car from "../model/car.model.js";
import Coupon from "../model/coupon.model.js";
import Payment from "../model/payment.model.js";
import { BOOKING_STATUSES } from "../model/booking.model.js";
import { parseValidDate } from "../utils/date.utils.js";
import { dateInput, nonEmptyString, numberInput, objectId, optionalField, pagination } from "./common.js";

const enumOf = (values, name) => z.enum(values, { error: `${name} must be one of: ${values.join(", ")}` });
const text = (name, max = 100) =>
  optionalField(z.string({ error: `${name} must be a single value` }).trim().max(max, `${name} must be at most ${max} characters`));

// Admin lists default to 20 rows (the shared pagination helper defaults to 10) and the admin UI
// asks for up to 200.
const adminLimit = numberInput("limit")
  .pipe(z.number().int().min(1, "limit must be at least 1").max(200, "limit must be at most 200"))
  .default(20);
const adminPage = { page: pagination.page, limit: adminLimit };

// "true"/"false" stay strings: the controllers compare them with === "true".
const flag = (name) => optionalField(z.enum(["true", "false"], { error: `${name} must be true or false` }));

export const listUsersQuery = z.object({
  ...adminPage,
  search: text("search"),
  role: optionalField(enumOf(["user", "admin"], "role")),
  active: flag("active"),
});

export const listAdminBookingsQuery = z.object({
  ...adminPage,
  search: text("search"),
  status: optionalField(enumOf(BOOKING_STATUSES, "status")),
});

export const listAdminPaymentsQuery = z.object({
  ...adminPage,
  status: optionalField(enumOf(Payment.schema.path("status").enumValues, "status")),
});

export const listAdminReviewsQuery = z.object({
  ...adminPage,
  status: optionalField(enumOf(["pending", "approved", "flagged"], "status")),
});

export const listCouponsQuery = z.object({ active: flag("active") });

// --- bodies (JSON only, so real booleans) ----------------------------------------------------
export const updateBookingStatusBody = z.object({
  status: optionalField(enumOf(BOOKING_STATUSES, "status")),
  // "" clears the note.
  adminNotes: z.string({ error: "adminNotes must be text" }).trim().max(1000, "adminNotes must be at most 1000 characters").optional(),
});

export const moderateReviewBody = z.object({
  approved: z.boolean({ error: "approved must be true or false" }),
  response: z.string({ error: "response must be text" }).trim().max(1000, "response must be at most 1000 characters").optional(),
});

const money = (name, min) => numberInput(name).pipe(z.number().min(min, `${name} must be at least ${min}`).max(10_000_000, `${name} is too large`));
const whole = (name, min, max) =>
  numberInput(name).pipe(
    z.number().int(`${name} must be a whole number`).min(min, `${name} must be at least ${min}`).max(max, `${name} must be at most ${max}`)
  );

// Only these fields reach the model. usageCount, usedBy and createdBy are server-managed and are
// dropped, where the controller used to pass the whole request body to Mongoose.
const couponFields = {
  code: nonEmptyString("code", 50),
  description: nonEmptyString("description", 500),
  type: enumOf(Coupon.schema.path("type").enumValues, "type"),
  value: numberInput("value").pipe(z.number().positive("value must be greater than 0").max(10_000_000, "value is too large")),
  minBookingAmount: money("minBookingAmount", 0),
  maxDiscountAmount: money("maxDiscountAmount", 0),
  startDate: dateInput("startDate"),
  endDate: dateInput("endDate"),
  usageLimit: whole("usageLimit", 1, 1_000_000),
  perUserLimit: whole("perUserLimit", 1, 1000),
  isActive: z.boolean({ error: "isActive must be true or false" }),
  applicableCars: z.array(objectId("applicableCars"), { error: "applicableCars must be a list of car ids" }).max(200),
  applicableCarTypes: z.array(enumOf(Car.schema.path("type").enumValues, "applicableCarTypes"), { error: "applicableCarTypes must be a list" }).max(20),
};

// Cross-field rules, applied only when both fields are present (updates are partial). Equal
// dates are allowed: a one-day coupon has the same start and end date.
const couponRules = (v, ctx) => {
  if (v.type === "percentage" && v.value !== undefined && v.value > 100) {
    ctx.addIssue({ code: "custom", path: ["value"], message: "value must be at most 100 for a percentage coupon" });
  }
  if (v.startDate !== undefined && v.endDate !== undefined && parseValidDate(v.endDate) < parseValidDate(v.startDate)) {
    ctx.addIssue({ code: "custom", path: ["endDate"], message: "endDate must not be before startDate" });
  }
};

const required = ["code", "description", "type", "value", "startDate", "endDate"];
const shape = (isRequired) =>
  Object.fromEntries(Object.entries(couponFields).map(([key, schema]) => [key, isRequired(key) ? schema : optionalField(schema)]));

export const createCouponBody = z.object(shape((k) => required.includes(k))).superRefine(couponRules);
export const updateCouponBody = z.object(shape(() => false)).superRefine(couponRules);
