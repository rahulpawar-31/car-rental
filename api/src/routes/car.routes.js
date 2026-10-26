import { Router } from "express";
import {
  getCars,
  getCarById,
  getFeaturedCars,
  checkCarAvailability,
  getCarBookedDates,
  createCar,
  updateCar,
  addCarImages,
  deleteCarImage,
  deleteCar,
  getCarFilters,
  uploadCarDocument,
  verifyCarDocument,
} from "../controllers/car.controller.js";
import { protect, authorize } from "../middleware/auth.middleware.js";
import { uploadCarImages, uploadCarDocument as uploadCarDocMiddleware } from "../middleware/upload.middleware.js";
import { validate } from "../middleware/validate.middleware.js";
import { idParams } from "../validation/common.js";
import {
  listCarsQuery,
  carAvailabilityQuery,
  carImageParams,
  carDocumentParams,
  createCarBody,
  updateCarBody,
  uploadDocumentBody,
} from "../validation/car.validation.js";

const router = Router();

router.get("/", validate({ query: listCarsQuery }), getCars);
router.get("/featured", getFeaturedCars);
router.get("/filters", getCarFilters);
router.get("/:id", validate({ params: idParams }), getCarById);
router.get("/:id/availability", validate({ params: idParams, query: carAvailabilityQuery }), checkCarAvailability);
router.get("/:id/booked-dates", validate({ params: idParams }), getCarBookedDates);

// Admin. Where a route takes an upload, ids are validated before multer runs so a bad request
// doesn't push a file to Cloudinary first; the body is validated after, once multer has parsed it.
router.use(protect, authorize("admin"));
router.post("/", uploadCarImages, validate({ body: createCarBody }), createCar);
router.patch("/:id", validate({ params: idParams, body: updateCarBody }), updateCar);
router.post("/:id/images", validate({ params: idParams }), uploadCarImages, addCarImages);
router.delete("/:id/images/:imageId", validate({ params: carImageParams }), deleteCarImage);
router.post(
  "/:id/documents/:docType",
  validate({ params: carDocumentParams }),
  uploadCarDocMiddleware,
  validate({ body: uploadDocumentBody }),
  uploadCarDocument
);
router.patch("/:id/documents/:docType/verify", validate({ params: carDocumentParams }), verifyCarDocument);
router.delete("/:id", validate({ params: idParams }), deleteCar);

export default router;
