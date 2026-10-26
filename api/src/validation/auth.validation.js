import { z } from "zod";
import { nonEmptyString, optionalField } from "./common.js";

// The user model trims and lowercases email, so normalise it the same way here: lookups and
// uniqueness behave identically whichever way a client cased it.
const normalisedEmail = (schema) => schema.trim().toLowerCase();

// Sign-up needs a real address. Everywhere else (login, forgot-password, verify-otp) email is
// only a lookup key: format is deliberately NOT checked, so a malformed address gets the same
// generic response as an unknown one rather than a distinguishing 400.
const registerEmail = normalisedEmail(z.string({ error: "email is required" })).pipe(
  z.email("email is not a valid email address").max(254, "email must be at most 254 characters")
);
const lookupEmail = normalisedEmail(z.string({ error: "email is required" }))
  .min(1, "email is required")
  .max(254, "email must be at most 254 characters");

// Passwords are never trimmed (leading/trailing spaces are legitimate). New passwords follow the
// user model's minimum; 128 is a generous cap well under what bcrypt actually uses.
const newPassword = z
  .string({ error: "password is required" })
  .min(8, "password must be at least 8 characters")
  .max(128, "password must be at most 128 characters");

// Login only checks presence, never policy: accounts created under any older rule must still
// be able to sign in, and the failure stays the controller's generic "Invalid email or password".
const loginPassword = z.string({ error: "password is required" }).min(1, "password is required").max(1000, "password is too long");

export const registerBody = z.object({
  name: nonEmptyString("name", 100),
  email: registerEmail,
  password: newPassword,
  phone: optionalField(z.string().trim().max(20, "phone must be at most 20 characters")),
});

export const loginBody = z.object({
  email: lookupEmail,
  password: loginPassword,
});

// The refresh token normally arrives in the httpOnly cookie, so the body is optional.
export const refreshTokenBody = z.object({
  refreshToken: optionalField(z.string({ error: "refreshToken must be a string" }).max(2000, "refreshToken is too long")),
});

export const forgotPasswordBody = z.object({
  email: lookupEmail,
});

export const verifyOtpBody = z.object({
  email: lookupEmail,
  otp: z.string({ error: "otp must be a 6-digit code" }).regex(/^\d{6}$/, "otp must be a 6-digit code"),
});

export const resetPasswordBody = z.object({
  resetToken: nonEmptyString("resetToken", 2000),
  password: newPassword,
});
