import { cloudinary } from "../config/cloudinary.js";

/**
 * Deletes a Cloudinary asset by public_id. Swallows failures (a stale or
 * already-deleted asset shouldn't fail the request that's replacing it) so
 * callers never need to remember to do that themselves.
 */
export function deleteAsset(publicId) {
  return cloudinary.uploader.destroy(publicId).catch(() => {});
}

/**
 * Legacy-compat fallback: re-derives a Cloudinary public_id from a stored
 * URL, for records saved before their publicId was captured at upload time.
 * Reproduces the pre-existing avatar-cleanup parsing verbatim (only the
 * part of the filename before the first dot survives), so behavior for
 * already-live data doesn't change now that it's centralized.
 */
export function extractPublicIdFromUrl(url, folder) {
  const filename = url.split("/").pop().split(".")[0];
  return `${folder}/${filename}`;
}
