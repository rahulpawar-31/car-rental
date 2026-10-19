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
import { authLimiter, otpAccountLimiter } from "../middleware/rateLimit.middleware.js";

const router = Router();

router.post("/register", register);
router.post("/login", authLimiter, login);
router.post("/logout", protect, logout);
router.post("/refresh-token", refreshToken);
router.post("/forgot-password", authLimiter, forgotPassword);
router.post("/verify-otp", authLimiter, otpAccountLimiter, verifyOtp);
router.post("/reset-password", authLimiter, resetPassword);
router.get("/me", protect, getMe);

export default router;
