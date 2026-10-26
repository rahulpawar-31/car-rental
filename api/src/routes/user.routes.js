import { Router } from "express";
import {
  getProfile,
  updateProfile,
  updateAvatar,
  changePassword,
  getRentalHistory,
  saveCar,
  saveLocation,
  updateDrivingLicense,
} from "../controllers/user.controller.js";
import { protect } from "../middleware/auth.middleware.js";
import { uploadProfileImage, uploadDocument } from "../middleware/upload.middleware.js";
import { validate } from "../middleware/validate.middleware.js";
import { listBookingsQuery } from "../validation/booking.validation.js";
import {
  updateProfileBody,
  changePasswordBody,
  savedCarParams,
  savedLocationParams,
  drivingLicenseBody,
} from "../validation/user.validation.js";

const router = Router();

router.use(protect);

router.get("/profile", getProfile);
router.patch("/profile", validate({ body: updateProfileBody }), updateProfile);
router.patch("/avatar", uploadProfileImage, updateAvatar);
router.patch("/change-password", validate({ body: changePasswordBody }), changePassword);
router.get("/rental-history", validate({ query: listBookingsQuery }), getRentalHistory);
router.post("/save-car/:carId", validate({ params: savedCarParams }), saveCar);
router.post("/save-location/:locationId", validate({ params: savedLocationParams }), saveLocation);
// The text fields are validated after multer, once it has parsed the multipart body.
router.patch("/driving-license", uploadDocument, validate({ body: drivingLicenseBody }), updateDrivingLicense);

export default router;
