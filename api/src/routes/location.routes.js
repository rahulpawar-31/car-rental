import { Router } from "express";
import {
  getLocations,
  getCities,
  getLocationById,
  createLocation,
  updateLocation,
  deleteLocation,
} from "../controllers/location.controller.js";
import { protect, authorize } from "../middleware/auth.middleware.js";
import { validate } from "../middleware/validate.middleware.js";
import { idParams } from "../validation/common.js";
import { listLocationsQuery, createLocationBody, updateLocationBody } from "../validation/location.validation.js";

const router = Router();

router.get("/", validate({ query: listLocationsQuery }), getLocations);
router.get("/cities", getCities);
router.get("/:id", validate({ params: idParams }), getLocationById);

router.use(protect, authorize("admin"));
router.post("/", validate({ body: createLocationBody }), createLocation);
router.patch("/:id", validate({ params: idParams, body: updateLocationBody }), updateLocation);
router.delete("/:id", validate({ params: idParams }), deleteLocation);

export default router;
