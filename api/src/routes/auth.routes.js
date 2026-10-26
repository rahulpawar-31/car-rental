import { Router } from "express";
import {
  register,
  login,
  logout,
  refreshToken,
  forgotPassword,
  verifyOtp,
  resetPassword,
  getMe,
} from "../controllers/auth.controller.js";
import { protect } from "../middleware/auth.middleware.js";
import { authAttemptLimiter, otpRequestLimiter } from "../middleware/rateLimit.middleware.js";
import { validate } from "../middleware/validate.middleware.js";
import {
  registerBody,
  loginBody,
  refreshTokenBody,
  forgotPasswordBody,
  verifyOtpBody,
  resetPasswordBody,
} from "../validation/auth.validation.js";

const router = Router();

// Rate limiters stay ahead of validation so malformed requests still burn the attempt budget.
router.post("/register", validate({ body: registerBody }), register);
router.post("/login", authAttemptLimiter, validate({ body: loginBody }), login);
router.post("/logout", protect, logout);
router.post("/refresh-token", validate({ body: refreshTokenBody }), refreshToken);
router.post("/forgot-password", otpRequestLimiter, validate({ body: forgotPasswordBody }), forgotPassword);
router.post("/verify-otp", authAttemptLimiter, validate({ body: verifyOtpBody }), verifyOtp);
router.post("/reset-password", authAttemptLimiter, validate({ body: resetPasswordBody }), resetPassword);
router.get("/me", protect, getMe);

export default router;
