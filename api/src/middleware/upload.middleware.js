import multer from "multer";
import { carImageStorage, profileImageStorage, documentStorage } from "../config/cloudinary.js";
import { AppError } from "./errorHandler.js";

// Exported for testing. Must use AppError (not a bare Error) so err.isOperational
// is true — otherwise the global error handler treats this as an unexpected 500
// and (in production) masks the real "invalid file type" message with a generic
// "Something went wrong" response instead of the 400 a bad upload should get.
export const fileFilter = (req, file, cb) => {
  const allowedMimeTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp", "application/pdf"];
  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new AppError("Invalid file type. Only JPEG, PNG, WebP and PDF are allowed.", 400), false);
  }
};

export const uploadCarImages = multer({
  storage: carImageStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter,
}).array("images", 10);

export const uploadProfileImage = multer({
  storage: profileImageStorage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter,
}).single("avatar");

export const uploadDocument = multer({
  storage: documentStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter,
}).single("document")

export const uploadCarDocument = multer({
  storage: documentStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter,
}).single("document");
