// @ts-check
import mongoose from "mongoose";
import Car from "../model/car.model.js";
import Booking from "../model/booking.model.js";
import { AppError } from "../middleware/errorHandler.js";
import { deleteAsset, extractPublicIdFromUrl } from "./media.js";
import { escapeRegex } from "../utils/regex.utils.js";
import { parseValidDate } from "../utils/date.utils.js";
import { ACTIVE_BOOKING_STATUSES, bookingConflictQuery } from "./carAvailability.js";

/** The only car fields a create/update request may set; everything else in the body is dropped. */
export const ALLOWED_CAR_FIELDS = new Set([
  "name",
  "brand",
  "model",
  "year",
  "type",
  "color",
  "transmission",
  "fuelType",
  "seats",
  "pricePerDay",
  "location",
  "isFeatured",
  "isAvailable",
  "isActive",
  "description",
  "features",
  "securityDeposit",
]);

export const DOCUMENT_TYPES = ["insurance", "registration", "pollution"];

/** @type {Record<string, Record<string, import('mongoose').SortOrder>>} */
export const CAR_SORT_OPTIONS = {
  "-createdAt": { createdAt: -1 },
  "price-asc": { pricePerDay: 1 },
  "price-desc": { pricePerDay: -1 },
  "rating-desc": { rating: -1 },
  "model-asc": { model: 1 },
  "-totalRentals": { totalRentals: -1 },
};

/**
 * Keeps only the allowed car fields of a request body.
 * @param {Record<string, any>} body
 * @returns {Record<string, any>}
 */
export function pickAllowedCarFields(body) {
  return Object.fromEntries(Object.entries(body).filter(([k]) => ALLOWED_CAR_FIELDS.has(k)));
}

/**
 * Maps freshly uploaded files to the car's image subdocuments.
 * @param {Express.Multer.File[]} files
 * @param {boolean} firstIsPrimary - true when creating a car (the first image becomes the cover)
 */
export function toCarImages(files, firstIsPrimary) {
  return files.map((f, i) => ({ url: f.path, publicId: f.filename, isPrimary: firstIsPrimary && i === 0 }));
}

/**
 * Validates page/limit for the car list. parseInt(x) || default would silently treat "0" the same
 * as "not provided" -- on main, page=0 hits Mongo's non-negative-skip check and 500s, and limit=0
 * hits Mongoose's "0 means unlimited" and returns every row uncapped. Neither was ever an
 * intentional API contract (no caller in this app sends either), so reject them outright instead
 * of reproducing either accident.
 * @param {string} page
 * @param {string} limit
 */
export function parsePaging(page, limit) {
  const pageNum = parseInt(page);
  const limitNum = parseInt(limit);
  if (!Number.isInteger(pageNum) || pageNum < 1) throw new AppError("Invalid page parameter", 400);
  if (!Number.isInteger(limitNum) || limitNum < 1) throw new AppError("Invalid limit parameter", 400);
  return { pageNum, limitNum };
}

/**
 * Builds the Mongo filter for the car list from its query parameters (every one a plain string).
 * @param {Record<string, string>} params
 * @returns {Record<string, any>}
 */
export function buildCarFilter(params) {
  const { type, brand, transmission, fuelType, location, minPrice, maxPrice, seats, search, available, featured } = params;

  /** @type {Record<string, any>} */
  const query = { isActive: true };

  if (type) query.type = { $in: type.split(",").map((t) => t.toLowerCase()) };
  if (brand)
    query.brand = {
      $in: brand.split(",").map((b) => new RegExp(`^${escapeRegex(b.trim())}$`, "i")),
    };
  if (transmission) query.transmission = transmission.toLowerCase();
  if (fuelType) query.fuelType = { $in: fuelType.split(",").map((f) => f.toLowerCase()) };
  if (location) {
    if (!mongoose.isValidObjectId(location)) throw new AppError("Invalid location ID", 400);
    query.location = location;
  }
  if (seats) query.seats = { $gte: parseInt(seats) };
  if (featured === "true") query.isFeatured = true;
  if (available !== undefined) query.isAvailable = available === "true";
  if (minPrice || maxPrice) {
    query.pricePerDay = {};
    if (minPrice) query.pricePerDay.$gte = parseFloat(minPrice);
    if (maxPrice) query.pricePerDay.$lte = parseFloat(maxPrice);
  }
  if (search) {
    query.$text = { $search: search };
  }

  return query;
}

/**
 * Parses and orders a pickup/drop pair.
 * @param {string} pickupDate
 * @param {string} dropDate
 */
function parseDateWindow(pickupDate, dropDate) {
  const pickup = parseValidDate(pickupDate);
  const drop = parseValidDate(dropDate);
  if (!pickup || !drop) throw new AppError("Invalid date format", 400);
  if (pickup >= drop) throw new AppError("Pickup date must be before drop date", 400);
  return { pickup, drop };
}

/**
 * The public car list: filters, optional exclusion of cars booked in a date window, sort and page.
 * @param {Record<string, string>} params - the request's query parameters
 */
export async function listCars(params) {
  const { page = "1", limit = "12", sort = "-createdAt", pickupDate, dropDate } = params;

  const { pageNum, limitNum } = parsePaging(page, limit);
  const query = buildCarFilter(params);

  if (pickupDate && dropDate) {
    const { pickup, drop } = parseDateWindow(pickupDate, dropDate);
    const bookedBookings = await Booking.find(bookingConflictQuery({ pickup, drop })).select("car");
    const bookedCarIds = bookedBookings.map((b) => b.car.toString());
    if (bookedCarIds.length > 0) {
      query._id = { $nin: bookedCarIds };
    }
  }

  const [cars, total] = await Promise.all([
    Car.find(query)
      .populate("location", "name city")
      .sort(CAR_SORT_OPTIONS[sort] || { createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .lean(),
    Car.countDocuments(query),
  ]);

  return {
    cars,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      pages: Math.ceil(total / limitNum),
    },
  };
}

/** @param {string} id */
export async function getCar(id) {
  const car = await Car.findById(id).populate("location", "name city address operatingHours");
  if (!car || !car.isActive) throw new AppError("Car not found", 404);

  return car;
}

export function getFeaturedCars() {
  return Car.find({ isFeatured: true, isActive: true, isAvailable: true })
    .populate("location", "name city")
    .limit(8)
    .lean();
}

/**
 * The date ranges a car is already booked for, from today on (for the booking calendar).
 * @param {string} id
 */
export async function getBookedRanges(id) {
  const car = await Car.findById(id);
  if (!car || !car.isActive) throw new AppError("Car not found", 404);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const bookings = await Booking.find({
    car: id,
    status: { $in: ACTIVE_BOOKING_STATUSES },
    dropDate: { $gt: today },
  })
    .select("pickupDate dropDate")
    .lean();

  return bookings.map((b) => ({
    from: b.pickupDate,
    to: b.dropDate,
  }));
}

/**
 * Whether a car is free (and listed as available) for a date window.
 * @param {string} id
 * @param {{ pickupDate?: string, dropDate?: string }} dates
 */
export async function isCarAvailable(id, { pickupDate, dropDate }) {
  if (!pickupDate || !dropDate) throw new AppError("Pickup and drop dates required", 400);

  const { pickup, drop } = parseDateWindow(pickupDate, dropDate);

  const car = await Car.findById(id);
  if (!car || !car.isActive) throw new AppError("Car not found", 404);

  const conflict = await Booking.findOne(bookingConflictQuery({ carId: id, pickup, drop }));

  return !conflict && car.isAvailable;
}

/**
 * Creates a car from the allowed body fields, with any uploaded images (the first becomes primary).
 * @param {Record<string, any>} body
 * @param {Express.Multer.File[] | undefined} files
 */
export function createCar(body, files) {
  const carData = pickAllowedCarFields(body);

  if (files?.length) {
    carData.images = toCarImages(files, true);
  }

  return Car.create(carData);
}

/**
 * @param {string} id
 * @param {Record<string, any>} body
 */
export async function updateCar(id, body) {
  const updates = pickAllowedCarFields(body);
  const car = await Car.findByIdAndUpdate(id, updates, {
    new: true,
    runValidators: true,
  });
  if (!car) throw new AppError("Car not found", 404);

  return car;
}

/**
 * Appends uploaded images to a car and returns its full image list.
 * @param {string} id
 * @param {Express.Multer.File[] | undefined} files
 */
export async function addCarImages(id, files) {
  if (!files?.length) throw new AppError("No images uploaded", 400);

  const newImages = toCarImages(files, false);

  const car = await Car.findByIdAndUpdate(
    id,
    { $push: { images: { $each: newImages } } },
    { new: true }
  );

  if (!car) throw new AppError("Car not found", 404);
  return car.images;
}

/**
 * @param {string} id
 * @param {string} imageId
 */
export async function deleteCarImage(id, imageId) {
  const car = await Car.findById(id);
  if (!car) throw new AppError("Car not found", 404);

  const image = car.images.id(imageId);
  if (!image) throw new AppError("Image not found", 404);

  if (image.publicId) {
    await deleteAsset(image.publicId);
  }

  car.images.pull(imageId);
  await car.save();
}

/** Soft-deletes a car (it stays in the database, marked inactive). @param {string} id */
export async function deactivateCar(id) {
  const car = await Car.findByIdAndUpdate(id, { isActive: false }, { new: true });
  if (!car) throw new AppError("Car not found", 404);
}

/**
 * Replaces one of a car's documents (insurance/registration/pollution) with an uploaded file.
 * @param {string} id
 * @param {string} docType
 * @param {Express.Multer.File | undefined} file
 * @param {string | undefined} expiryDate
 */
export async function uploadCarDocument(id, docType, file, expiryDate) {
  if (!DOCUMENT_TYPES.includes(docType))
    throw new AppError("Invalid document type. Use: insurance, registration, pollution", 400);
  // Narrow now that docType is checked against DOCUMENT_TYPES above.
  const docKey = /** @type {'insurance'|'registration'|'pollution'} */ (docType);
  if (!file) throw new AppError("No document uploaded", 400);

  const existing = await Car.findById(id).select(`documents.${docKey}`);
  if (!existing) throw new AppError("Car not found", 404);

  const oldDoc = existing.documents?.[docKey];
  if (oldDoc?.url) {
    const publicId = oldDoc.publicId || extractPublicIdFromUrl(oldDoc.url, "car-rental/documents");
    await deleteAsset(publicId);
  }

  /** @type {Record<string, any>} */
  const update = {
    [`documents.${docKey}.url`]: file.path,
    [`documents.${docKey}.publicId`]: file.filename,
    [`documents.${docKey}.verified`]: false,
  };
  if (expiryDate) {
    const parsedExpiry = parseValidDate(expiryDate);
    if (!parsedExpiry) throw new AppError("Invalid expiry date", 400);
    update[`documents.${docKey}.expiryDate`] = parsedExpiry;
  }

  const car = await Car.findByIdAndUpdate(id, update, { new: true });
  if (!car) throw new AppError("Car not found", 404);

  return car.documents;
}

/**
 * Marks one of a car's documents as verified.
 * @param {string} id
 * @param {string} docType
 */
export async function verifyCarDocument(id, docType) {
  if (!DOCUMENT_TYPES.includes(docType)) throw new AppError("Invalid document type", 400);

  const car = await Car.findByIdAndUpdate(
    id,
    { [`documents.${docType}.verified`]: true },
    { new: true }
  );
  if (!car) throw new AppError("Car not found", 404);

  return car.documents;
}

/** The values the car list's filter UI offers. */
export async function getCarFilters() {
  const [brands, types, fuelTypes, priceRange] = await Promise.all([
    Car.distinct("brand", { isActive: true }),
    Car.distinct("type", { isActive: true }),
    Car.distinct("fuelType", { isActive: true }),
    Car.aggregate([
      { $match: { isActive: true } },
      { $group: { _id: null, min: { $min: "$pricePerDay" }, max: { $max: "$pricePerDay" } } },
    ]),
  ]);

  return {
    brands: brands.sort(),
    types: types.sort(),
    transmissions: ["automatic", "manual"],
    fuelTypes: fuelTypes.sort(),
    priceRange: priceRange[0] || { min: 0, max: 10000 },
  };
}
