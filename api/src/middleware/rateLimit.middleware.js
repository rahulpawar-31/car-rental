import { rateLimit } from "express-rate-limit";

const windowMs = () => parseInt(process.env.AUTH_RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000;
const message = { success: false, message: "Too many attempts. Please try again later." };

// Strict per-IP limiter for credential-guessing targets (login, OTP, password reset).
// Layered on top of the global /api/ limiter, which stays in place for every other route.
export const createAuthLimiter = ({ max, windowMs: window } = {}) =>
  rateLimit({
    windowMs: window ?? windowMs(),
    max: max ?? (parseInt(process.env.AUTH_RATE_LIMIT_MAX) || 10),
    standardHeaders: true,
    legacyHeaders: false,
    message,
  });

// Per-account limiter for OTP guesses, so rotating IPs doesn't buy extra attempts at one
// account's 6-digit code. Falls back to the IP when the request has no email.
export const createOtpAccountLimiter = ({ max, windowMs: window } = {}) =>
  rateLimit({
    windowMs: window ?? windowMs(),
    max: max ?? (parseInt(process.env.OTP_RATE_LIMIT_MAX) || 5),
    standardHeaders: true,
    legacyHeaders: false,
    message,
    keyGenerator: (req) => {
      const email = req.body?.email;
      return typeof email === "string" && email ? `otp:${email.trim().toLowerCase()}` : req.ip;
    },
  });

export const authLimiter = createAuthLimiter();
export const otpAccountLimiter = createOtpAccountLimiter();
