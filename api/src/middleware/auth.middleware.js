import { verifyAccessToken } from "../utils/jwt.utils.js";
import User from "../model/user.model.js";
import { AppError } from "./errorHandler.js";

const extractToken = (req) => {
  if (req.headers.authorization?.startsWith("Bearer ")) {
    return req.headers.authorization.split(" ")[1];
  }
  return req.cookies?.accessToken;
};

// Shared by protect and optionalAuth so both enforce the same token checks.
// Throws AppError (or a jwt error) when the token is not valid and current.
const resolveUser = async (token) => {
  const decoded = verifyAccessToken(token);
  // Password-reset tokens are single-purpose (POST /auth/reset-password only) — reject
  // them here so a leaked reset token can't be replayed as a general bearer token.
  if (decoded.role === "reset") throw new AppError("Invalid or expired token", 401);

  const user = await User.findById(decoded.id).select("+passwordChangedAt");
  if (!user) throw new AppError("User no longer exists.", 401);
  if (!user.isActive) throw new AppError("Your account has been deactivated.", 401);
  if (user.changedPasswordAfter(decoded.iat)) {
    throw new AppError("Password was recently changed. Please log in again.", 401);
  }

  return user;
};

export const protect = async (req, res, next) => {
  const token = extractToken(req);
  if (!token) throw new AppError("Authentication required. Please log in.", 401);

  req.user = await resolveUser(token);
  next();
};

export const authorize = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      throw new AppError("You do not have permission to perform this action.", 403);
    }
    next();
  };
};

export const optionalAuth = async (req, res, next) => {
  const token = extractToken(req);
  if (!token) return next();

  try {
    req.user = await resolveUser(token);
  } catch {
    // ignore auth errors for optional auth — the request proceeds as anonymous
  }
  next();
};
