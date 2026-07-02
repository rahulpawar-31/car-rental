import Location from "../model/location.model.js";
import Car from "../model/car.model.js";
import { AppError } from "../middleware/errorHandler.js";
import { escapeRegex } from "../utils/regex.utils.js";

export const getLocations = async (req, res) => {
  const { city, search, active = "true" } = req.query;

  const query = {};
  if (active === "true") query.isActive = true;
  if (city) query.city = new RegExp(escapeRegex(city), "i");
  if (search) query.$text = { $search: search };

  const locations = await Location.find(query).sort({ city: 1, name: 1 }).lean();

  res.json({ success: true, data: { locations } });
};

export const getCities = async (req, res) => {
  const cities = await Location.distinct("city", { isActive: true });
  res.json({ success: true, data: { cities: cities.sort() } });
};

export const getLocationById = async (req, res) => {
  const location = await Location.findById(req.params.id);
  if (!location) throw new AppError("Location not found", 404);

  const carCount = await Car.countDocuments({ location: location._id, isActive: true, isAvailable: true });
  res.json({ success: true, data: { location, availableCars: carCount } });
};

export const createLocation = async (req, res) => {
  const location = await Location.create(req.body);
  res.status(201).json({ success: true, message: "Location created", data: { location } });
};

export const updateLocation = async (req, res) => {
  const location = await Location.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  if (!location) throw new AppError("Location not found", 404);

  res.json({ success: true, message: "Location updated", data: { location } });
};

export const deleteLocation = async (req, res) => {
  const carCount = await Car.countDocuments({ location: req.params.id, isActive: true });
  if (carCount > 0) throw new AppError(`Cannot delete — ${carCount} active car(s) at this location`, 400);

  const location = await Location.findByIdAndUpdate(req.params.id, { isActive: false }, { new: true });
  if (!location) throw new AppError("Location not found", 404);

  res.json({ success: true, message: "Location deactivated" });
};
