import { rateLimit } from "express-rate-limit";

const tooMany = { success: false, message: "Too many attempts. Please try again later." };

// Guards credential/OTP guessing: login, verify-otp, reset-password. Successful
// requests are not counted so a legitimate user is never locked out by their own
// logins; only failed attempts burn the budget.
export const authAttemptLimiter = rateLimit({
  windowMs: parseInt(process.env.AUTH_RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: parseInt(process.env.AUTH_RATE_LIMIT_MAX) || 10,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: tooMany,
});

// forgot-password always answers 200 (to avoid revealing which emails exist) and
// sends an email, so every request counts.
export const otpRequestLimiter = rateLimit({
  windowMs: parseInt(process.env.OTP_REQUEST_RATE_LIMIT_WINDOW_MS) || 60 * 60 * 1000,
  max: parseInt(process.env.OTP_REQUEST_RATE_LIMIT_MAX) || 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: tooMany,
});

// The contact form is public and every request emails the site owner, so each one counts
// (including rejected ones), on top of the global limiter.
export const contactLimiter = rateLimit({
  windowMs: parseInt(process.env.CONTACT_RATE_LIMIT_WINDOW_MS) || 60 * 60 * 1000,
  max: parseInt(process.env.CONTACT_RATE_LIMIT_MAX) || 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: tooMany,
});
