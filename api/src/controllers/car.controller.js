// @ts-check
import mongoose from "mongoose";
import Car from "../model/car.model.js";
import Booking from "../model/booking.model.js";
import { AppError } from "../middleware/errorHandler.js";
import { deleteAsset, extractPublicIdFromUrl } from "../services/media.js";
import { escapeRegex } from "../utils/regex.utils.js";
import { parseValidDate } from "../utils/date.utils.js";
import { ACTIVE_BOOKING_STATUSES, bookingConflictQuery } from "../services/carAvailability.js";

const ALLOWED_CAR_FIELDS = new Set([
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

/** @type {import('express').RequestHandler} */
export const getCars = async (req, res) => {
  // req.query values are typed string|string[]|ParsedQs by Express (query
  // strings can technically repeat/nest) -- every field this route reads is
  // always a plain string in practice, so cast once here rather than at
  // each usage site below.
  const q = /** @type {Record<string, string>} */ (req.query);
  const {
    page = "1",
    limit = "12",
    type,
    brand,
    transmission,
    fuelType,
    location,
    minPrice,
    maxPrice,
    seats,
    search,
    sort = "-createdAt",
    available,
    pickupDate,
    dropDate,
    featured,
  } = q;
  // parseInt(x) || default would silently treat "0" the same as "not
  // provided" -- on main, page=0 hits Mongo's non-negative-skip check and
  // 500s, and limit=0 hits Mongoose's "0 means unlimited" and returns every
  // row uncapped. Neither was ever an intentional API contract (no caller
  // in this app sends either), so reject them outright instead of
  // reproducing either accident.
  const pageNum = parseInt(page);
  const limitNum = parseInt(limit);
  if (!Number.isInteger(pageNum) || pageNum < 1) throw new AppError("Invalid page parameter", 400);
  if (!Number.isInteger(limitNum) || limitNum < 1)
    throw new AppError("Invalid limit parameter", 400);

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

  if (pickupDate && dropDate) {
    const pickup = parseValidDate(pickupDate);
    const drop = parseValidDate(dropDate);
    if (!pickup || !drop) throw new AppError("Invalid date format", 400);
    if (pickup >= drop) throw new AppError("Pickup date must be before drop date", 400);
    const bookedBookings = await Booking.find(bookingConflictQuery({ pickup, drop })).select("car");
    const bookedCarIds = bookedBookings.map((b) => b.car.toString());
    if (bookedCarIds.length > 0) {
      query._id = { $nin: bookedCarIds };
    }
  }

  /** @type {Record<string, Record<string, import('mongoose').SortOrder>>} */
  const sortOptions = {
    "-createdAt": { createdAt: -1 },
    "price-asc": { pricePerDay: 1 },
    "price-desc": { pricePerDay: -1 },
    "rating-desc": { rating: -1 },
    "model-asc": { model: 1 },
    "-totalRentals": { totalRentals: -1 },
  };

  const [cars, total] = await Promise.all([
    Car.find(query)
      .populate("location", "name city")
      .sort(sortOptions[sort] || { createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .lean(),
    Car.countDocuments(query),
  ]);

  res.json({
    success: true,
    data: {
      cars,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
      },
    },
  });
};

/** @type {import('express').RequestHandler} */
export const getCarById = async (req, res) => {
  const car = await Car.findById(req.params.id).populate(
    "location",
    "name city address operatingHours"
  );
  if (!car || !car.isActive) throw new AppError("Car not found", 404);

  res.json({ success: true, data: { car } });
};

/** @type {import('express').RequestHandler} */
export const getFeaturedCars = async (req, res) => {
  const cars = await Car.find({ isFeatured: true, isActive: true, isAvailable: true })
    .populate("location", "name city")
    .limit(8)
    .lean();

  res.json({ success: true, data: { cars } });
};

/** @type {import('express').RequestHandler} */
export const getCarBookedDates = async (req, res) => {
  const { id } = req.params;

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

  const bookedRanges = bookings.map((b) => ({
    from: b.pickupDate,
    to: b.dropDate,
  }));

  res.json({ success: true, data: { bookedRanges } });
};

/** @type {import('express').RequestHandler} */
export const checkCarAvailability = async (req, res) => {
  const { id } = req.params;
  const { pickupDate, dropDate } = /** @type {Record<string, string>} */ (req.query);

  if (!pickupDate || !dropDate) throw new AppError("Pickup and drop dates required", 400);

  const pickup = parseValidDate(pickupDate);
  const drop = parseValidDate(dropDate);
  if (!pickup || !drop) throw new AppError("Invalid date format", 400);
  if (pickup >= drop) throw new AppError("Pickup date must be before drop date", 400);

  const car = await Car.findById(id);
  if (!car || !car.isActive) throw new AppError("Car not found", 404);

  const conflict = await Booking.findOne(bookingConflictQuery({ carId: id, pickup, drop }));

  const available = !conflict && car.isAvailable;

  res.json({ success: true, data: { available } });
};

/** @type {import('express').RequestHandler} */
export const createCar = async (req, res) => {
  /** @type {Record<string, any>} */
  const carData = Object.fromEntries(
    Object.entries(req.body).filter(([k]) => ALLOWED_CAR_FIELDS.has(k))
  );

  // uploadCarImages (upload.middleware.js) always uses multer's .array(),
  // so req.files here is always Express.Multer.File[], never the
  // fieldname-keyed shape multer's other .fields()/.any() modes produce.
  const files = /** @type {Express.Multer.File[] | undefined} */ (req.files);
  if (files?.length) {
    carData.images = files.map((f, i) => ({
      url: f.path,
      publicId: f.filename,
      isPrimary: i === 0,
    }));
  }

  const car = await Car.create(carData);
  res.status(201).json({ success: true, message: "Car created", data: { car } });
};

/** @type {import('express').RequestHandler} */
export const updateCar = async (req, res) => {
  /** @type {Record<string, any>} */
  const updates = Object.fromEntries(
    Object.entries(req.body).filter(([k]) => ALLOWED_CAR_FIELDS.has(k))
  );
  const car = await Car.findByIdAndUpdate(req.params.id, updates, {
    new: true,
    runValidators: true,
  });
  if (!car) throw new AppError("Car not found", 404);

  res.json({ success: true, message: "Car updated", data: { car } });
};

/** @type {import('express').RequestHandler} */
export const addCarImages = async (req, res) => {
  // uploadCarImages always uses multer's .array(), see createCar's comment.
  const files = /** @type {Express.Multer.File[] | undefined} */ (req.files);
  if (!files?.length) throw new AppError("No images uploaded", 400);

  const newImages = files.map((f) => ({ url: f.path, publicId: f.filename, isPrimary: false }));

  const car = await Car.findByIdAndUpdate(
    req.params.id,
    { $push: { images: { $each: newImages } } },
    { new: true }
  );

  if (!car) throw new AppError("Car not found", 404);
  res.json({ success: true, message: "Images added", data: { images: car.images } });
};

/** @type {import('express').RequestHandler} */
export const deleteCarImage = async (req, res) => {
  const { id, imageId } = req.params;
  const car = await Car.findById(id);
  if (!car) throw new AppError("Car not found", 404);

  const image = car.images.id(imageId);
  if (!image) throw new AppError("Image not found", 404);

  if (image.publicId) {
    await deleteAsset(image.publicId);
  }

  car.images.pull(imageId);
  await car.save();

  res.json({ success: true, message: "Image deleted" });
};

/** @type {import('express').RequestHandler} */
export const deleteCar = async (req, res) => {
  const car = await Car.findByIdAndUpdate(req.params.id, { isActive: false }, { new: true });
  if (!car) throw new AppError("Car not found", 404);

  res.json({ success: true, message: "Car deactivated" });
};

/** @type {import('express').RequestHandler} */
export const uploadCarDocument = async (req, res) => {
  const { id, docType } = req.params;
  const validTypes = ["insurance", "registration", "pollution"];
  if (!validTypes.includes(docType))
    throw new AppError("Invalid document type. Use: insurance, registration, pollution", 400);
  // Narrow now that docType is checked against validTypes above.
  const docKey = /** @type {'insurance'|'registration'|'pollution'} */ (docType);
  if (!req.file) throw new AppError("No document uploaded", 400);

  const existing = await Car.findById(id).select(`documents.${docKey}`);
  if (!existing) throw new AppError("Car not found", 404);

  const oldDoc = existing.documents?.[docKey];
  if (oldDoc?.url) {
    const publicId = oldDoc.publicId || extractPublicIdFromUrl(oldDoc.url, "car-rental/documents");
    await deleteAsset(publicId);
  }

  const { expiryDate } = req.body;
  /** @type {Record<string, any>} */
  const update = {
    [`documents.${docKey}.url`]: req.file.path,
    [`documents.${docKey}.publicId`]: req.file.filename,
    [`documents.${docKey}.verified`]: false,
  };
  if (expiryDate) {
    const parsedExpiry = parseValidDate(expiryDate);
    if (!parsedExpiry) throw new AppError("Invalid expiry date", 400);
    update[`documents.${docKey}.expiryDate`] = parsedExpiry;
  }

  const car = await Car.findByIdAndUpdate(id, update, { new: true });
  if (!car) throw new AppError("Car not found", 404);

  res.json({
    success: true,
    message: `${docType} document uploaded`,
    data: { documents: car.documents },
  });
};

/** @type {import('express').RequestHandler} */
export const verifyCarDocument = async (req, res) => {
  const { id, docType } = req.params;
  const validTypes = ["insurance", "registration", "pollution"];
  if (!validTypes.includes(docType)) throw new AppError("Invalid document type", 400);

  const car = await Car.findByIdAndUpdate(
    id,
    { [`documents.${docType}.verified`]: true },
    { new: true }
  );
  if (!car) throw new AppError("Car not found", 404);

  res.json({
    success: true,
    message: `${docType} document verified`,
    data: { documents: car.documents },
  });
};

/** @type {import('express').RequestHandler} */
export const getCarFilters = async (req, res) => {
  const [brands, types, fuelTypes, priceRange] = await Promise.all([
    Car.distinct("brand", { isActive: true }),
    Car.distinct("type", { isActive: true }),
    Car.distinct("fuelType", { isActive: true }),
    Car.aggregate([
      { $match: { isActive: true } },
      { $group: { _id: null, min: { $min: "$pricePerDay" }, max: { $max: "$pricePerDay" } } },
    ]),
  ]);

  res.json({
    success: true,
    data: {
      brands: brands.sort(),
      types: types.sort(),
      transmissions: ["automatic", "manual"],
      fuelTypes: fuelTypes.sort(),
      priceRange: priceRange[0] || { min: 0, max: 10000 },
    },
  });
};
