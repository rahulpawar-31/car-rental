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

const router = Router();

router.post("/register", register);
router.post("/login", authAttemptLimiter, login);
router.post("/logout", protect, logout);
router.post("/refresh-token", refreshToken);
router.post("/forgot-password", otpRequestLimiter, forgotPassword);
router.post("/verify-otp", authAttemptLimiter, verifyOtp);
router.post("/reset-password", authAttemptLimiter, resetPassword);
router.get("/me", protect, getMe);

export default router;
