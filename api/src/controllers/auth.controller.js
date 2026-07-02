import User from "../model/user.model.js";
import { AppError } from "../middleware/errorHandler.js";
import {
  generateAccessToken,
  generateRefreshToken,
  generateResetToken,
  verifyRefreshToken,
  setTokenCookies,
  clearTokenCookies,
} from "../utils/jwt.utils.js";
import { generateOTP } from "../utils/otp.utils.js";
import { sendOtpEmail, sendWelcomeEmail } from "../utils/email.utils.js";

export const register = async (req, res) => {
  const { name, email, password, phone } = req.body;

  const existing = await User.findOne({ email });
  if (existing) throw new AppError("Email already in use", 409);

  const user = await User.create({ name, email, password, phone });

  await sendWelcomeEmail(email, name).catch(() => {});

  const accessToken = generateAccessToken(user._id, user.role);
  const refreshToken = generateRefreshToken(user._id);

  user.refreshToken = refreshToken;
  await user.save({ validateBeforeSave: false });

  setTokenCookies(res, accessToken, refreshToken);

  res.status(201).json({
    success: true,
    message: "Account created successfully",
    data: {
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        avatar: user.avatar,
      },
      accessToken,
    },
  });
};

export const login = async (req, res) => {
  const { email, password } = req.body;

  const user = await User.findOne({ email }).select("+password +refreshToken");
  if (!user || !(await user.comparePassword(password))) {
    throw new AppError("Invalid email or password", 401);
  }
  if (!user.isActive) throw new AppError("Your account has been deactivated", 401);

  const accessToken = generateAccessToken(user._id, user.role);
  const refreshToken = generateRefreshToken(user._id);

  user.refreshToken = refreshToken;
  await user.save({ validateBeforeSave: false });

  setTokenCookies(res, accessToken, refreshToken);

  res.json({
    success: true,
    message: "Login successful",
    data: {
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        avatar: user.avatar,
      },
      accessToken,
    },
  });
};

export const logout = async (req, res) => {
  const user = await User.findById(req.user._id);
  if (user) {
    user.refreshToken = undefined;
    await user.save({ validateBeforeSave: false });
  }
  clearTokenCookies(res);
  res.json({ success: true, message: "Logged out successfully" });
};

export const refreshToken = async (req, res) => {
  const token = req.cookies?.refreshToken || req.body?.refreshToken;
  if (!token) throw new AppError("Refresh token required", 401);

  const decoded = verifyRefreshToken(token);
  const user = await User.findById(decoded.id).select("+refreshToken");

  if (!user || user.refreshToken !== token) {
    throw new AppError("Invalid or expired refresh token", 401);
  }

  const accessToken = generateAccessToken(user._id, user.role);
  const newRefreshToken = generateRefreshToken(user._id);

  user.refreshToken = newRefreshToken;
  await user.save({ validateBeforeSave: false });

  setTokenCookies(res, accessToken, newRefreshToken);

  res.json({ success: true, data: { accessToken } });
};

export const forgotPassword = async (req, res) => {
  const { email } = req.body;

  const user = await User.findOne({ email });
  if (!user) {
    return res.json({ success: true, message: "If that email exists, an OTP has been sent" });
  }

  const otp = generateOTP();
  user.otp = otp;
  user.otpExpiry = new Date(Date.now() + 10 * 60 * 1000);
  await user.save({ validateBeforeSave: false });

  await sendOtpEmail(email, otp, user.name);

  res.json({ success: true, message: "OTP sent to your email address" });
};

export const verifyOtp = async (req, res) => {
  const { email, otp } = req.body;

  const user = await User.findOne({ email }).select("+otp +otpExpiry");
  if (!user || user.otp !== otp || !user.otpExpiry || user.otpExpiry < Date.now()) {
    throw new AppError("Invalid or expired OTP", 400);
  }

  user.otp = undefined;
  user.otpExpiry = undefined;
  await user.save({ validateBeforeSave: false });

  const resetToken = generateResetToken(user._id);
  res.json({ success: true, message: "OTP verified", data: { resetToken } });
};

export const resetPassword = async (req, res) => {
  const { resetToken, password } = req.body;

  let decoded;
  try {
    const jwt = await import("jsonwebtoken");
    decoded = jwt.default.verify(resetToken, process.env.JWT_SECRET);
  } catch {
    throw new AppError("Invalid or expired reset token", 400);
  }
  if (decoded.role !== "reset") throw new AppError("Invalid reset token", 400);

  const user = await User.findById(decoded.id);
  if (!user) throw new AppError("User not found", 404);

  user.password = password;
  user.passwordChangedAt = new Date();
  user.refreshToken = undefined;
  await user.save();

  clearTokenCookies(res);
  res.json({ success: true, message: "Password reset successfully. Please log in." });
};

export const getMe = async (req, res) => {
  const user = await User.findById(req.user._id).populate("savedCars", "name brand model images pricePerDay").populate("savedLocations", "name city");

  res.json({ success: true, data: { user } });
};
