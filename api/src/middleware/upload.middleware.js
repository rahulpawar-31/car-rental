import multer from "multer";
import { carImageStorage, profileImageStorage, documentStorage } from "../config/cloudinary.js";
import { AppError } from "./errorHandler.js";
import { deleteUploadedFiles } from "../services/media.js";

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

// Multer's Cloudinary storage uploads each file while it parses the request, before validation or
// the handler have run. Multer cleans up after itself when it rejects a request (bad file type,
// too large), but not when a later step rejects one: a validation error, a "not found", a business
// rule. Those requests would leave their files in Cloudinary with nothing referencing them.
//
// So once the response is sent, a 4xx response deletes the files the request uploaded. Only 4xx:
// every upload handler rejects with a 4xx before it saves anything, whereas after a 5xx it may
// already have stored the file's URL, and deleting then would break live data. If a handler ever
// saves first and then rejects with a 4xx, it must not use this middleware.

/** Every file multer attached to the request, whether it ran .single(), .array() or .fields(). */
function uploadedFiles(req) {
  if (req.file) return [req.file];
  if (Array.isArray(req.files)) return req.files;
  if (req.files) return Object.values(req.files).flat();
  return [];
}

export function discardUploadsOnClientError(req, res, next) {
  res.on("finish", () => {
    if (res.statusCode < 400 || res.statusCode >= 500) return;
    const files = uploadedFiles(req);
    if (files.length > 0) deleteUploadedFiles(files);
  });
  next();
}

// Each upload middleware is multer followed by the cleanup, so routes keep using one name.
const withCleanup = (multerMiddleware) => [multerMiddleware, discardUploadsOnClientError];

export const uploadCarImages = withCleanup(
  multer({
    storage: carImageStorage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter,
  }).array("images", 10)
);

export const uploadProfileImage = withCleanup(
  multer({
    storage: profileImageStorage,
    limits: { fileSize: 2 * 1024 * 1024 },
    fileFilter,
  }).single("avatar")
);

export const uploadDocument = withCleanup(
  multer({
    storage: documentStorage,
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter,
  }).single("document")
);

export const uploadCarDocument = withCleanup(
  multer({
    storage: documentStorage,
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter,
  }).single("document")
);
