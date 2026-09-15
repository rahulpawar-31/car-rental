import mongoose from "mongoose";
import Car from "../model/car.model.js";
import Booking from "../model/booking.model.js";
import { AppError } from "../middleware/errorHandler.js";
import { cloudinary } from "../config/cloudinary.js";
import { escapeRegex } from "../utils/regex.utils.js";
import { ACTIVE_BOOKING_STATUSES, bookingConflictQuery } from "../services/carAvailability.js";

const ALLOWED_CAR_FIELDS = new Set([
  'name', 'brand', 'model', 'year', 'type', 'color', 'transmission', 'fuelType',
  'seats', 'pricePerDay', 'location', 'isFeatured', 'isAvailable', 'isActive',
  'description', 'features', 'securityDeposit',
]);

export const getCars = async (req, res) => {
  const {
    page = 1,
    limit = 12,
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
  } = req.query;

  const query = { isActive: true };

  if (type) query.type = { $in: type.split(",").map(t => t.toLowerCase()) };
  if (brand) query.brand = { $in: brand.split(",").map(b => new RegExp(`^${escapeRegex(b.trim())}$`, "i")) };
  if (transmission) query.transmission = transmission.toLowerCase();
  if (fuelType) query.fuelType = { $in: fuelType.split(",").map(f => f.toLowerCase()) };
  if (location) {
    if (!mongoose.isValidObjectId(location)) throw new AppError('Invalid location ID', 400);
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

  let bookedCarIds = [];
  if (pickupDate && dropDate) {
    const pickup = new Date(pickupDate);
    const drop = new Date(dropDate);
    if (isNaN(pickup.getTime()) || isNaN(drop.getTime())) throw new AppError('Invalid date format', 400);
    if (pickup >= drop) throw new AppError('Pickup date must be before drop date', 400);
    const bookedBookings = await Booking.find(bookingConflictQuery({ pickup, drop })).select("car");
    bookedCarIds = bookedBookings.map((b) => b.car.toString());
    if (bookedCarIds.length > 0) {
      query._id = { $nin: bookedCarIds };
    }
  }

  const sortOptions = {
    "-createdAt":    { createdAt: -1 },
    "price-asc":     { pricePerDay: 1 },
    "price-desc":    { pricePerDay: -1 },
    "rating-desc":   { rating: -1 },
    "model-asc":     { model: 1 },
    "-totalRentals": { totalRentals: -1 },
  };

  const [cars, total] = await Promise.all([
    Car.find(query)
      .populate("location", "name city")
      .sort(sortOptions[sort] || { createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .lean(),
    Car.countDocuments(query),
  ]);

  res.json({
    success: true,
    data: {
      cars,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit),
      },
    },
  });
};

export const getCarById = async (req, res) => {
  const car = await Car.findById(req.params.id).populate("location", "name city address operatingHours");
  if (!car || !car.isActive) throw new AppError("Car not found", 404);

  res.json({ success: true, data: { car } });
};

export const getFeaturedCars = async (req, res) => {
  const cars = await Car.find({ isFeatured: true, isActive: true, isAvailable: true })
    .populate("location", "name city")
    .limit(8)
    .lean();

  res.json({ success: true, data: { cars } });
};

export const getCarBookedDates = async (req, res) => {
  const { id } = req.params;

  const car = await Car.findById(id);
  if (!car || !car.isActive) throw new AppError('Car not found', 404);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const bookings = await Booking.find({
    car: id,
    status: { $in: ACTIVE_BOOKING_STATUSES },
    dropDate: { $gt: today },
  })
    .select('pickupDate dropDate')
    .lean();

  const bookedRanges = bookings.map(b => ({
    from: b.pickupDate,
    to: b.dropDate,
  }));

  res.json({ success: true, data: { bookedRanges } });
};

export const checkCarAvailability = async (req, res) => {
  const { id } = req.params;
  const { pickupDate, dropDate } = req.query;

  if (!pickupDate || !dropDate) throw new AppError("Pickup and drop dates required", 400);

  const pickup = new Date(pickupDate);
  const drop = new Date(dropDate);
  if (isNaN(pickup.getTime()) || isNaN(drop.getTime())) throw new AppError('Invalid date format', 400);
  if (pickup >= drop) throw new AppError('Pickup date must be before drop date', 400);

  const car = await Car.findById(id);
  if (!car || !car.isActive) throw new AppError("Car not found", 404);

  const conflict = await Booking.findOne(bookingConflictQuery({ carId: id, pickup, drop }));

  const available = !conflict && car.isAvailable;

  res.json({ success: true, data: { available } });
};

export const createCar = async (req, res) => {
  const carData = Object.fromEntries(
    Object.entries(req.body).filter(([k]) => ALLOWED_CAR_FIELDS.has(k))
  );

  if (req.files?.length > 0) {
    carData.images = req.files.map((f, i) => ({
      url: f.path,
      publicId: f.filename,
      isPrimary: i === 0,
    }));
  }

  const car = await Car.create(carData);
  res.status(201).json({ success: true, message: "Car created", data: { car } });
};

export const updateCar = async (req, res) => {
  const updates = Object.fromEntries(
    Object.entries(req.body).filter(([k]) => ALLOWED_CAR_FIELDS.has(k))
  );
  const car = await Car.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true });
  if (!car) throw new AppError("Car not found", 404);

  res.json({ success: true, message: "Car updated", data: { car } });
};

export const addCarImages = async (req, res) => {
  if (!req.files?.length) throw new AppError("No images uploaded", 400);

  const newImages = req.files.map((f) => ({ url: f.path, publicId: f.filename, isPrimary: false }));

  const car = await Car.findByIdAndUpdate(
    req.params.id,
    { $push: { images: { $each: newImages } } },
    { new: true }
  );

  if (!car) throw new AppError("Car not found", 404);
  res.json({ success: true, message: "Images added", data: { images: car.images } });
};

export const deleteCarImage = async (req, res) => {
  const { id, imageId } = req.params;
  const car = await Car.findById(id);
  if (!car) throw new AppError("Car not found", 404);

  const image = car.images.id(imageId);
  if (!image) throw new AppError("Image not found", 404);

  if (image.publicId) {
    await cloudinary.uploader.destroy(image.publicId).catch(() => {});
  }

  car.images.pull(imageId);
  await car.save();

  res.json({ success: true, message: "Image deleted" });
};

export const deleteCar = async (req, res) => {
  const car = await Car.findByIdAndUpdate(req.params.id, { isActive: false }, { new: true });
  if (!car) throw new AppError("Car not found", 404);

  res.json({ success: true, message: "Car deactivated" });
};

export const uploadCarDocument = async (req, res) => {
  const { id, docType } = req.params;
  const validTypes = ["insurance", "registration", "pollution"];
  if (!validTypes.includes(docType)) throw new AppError("Invalid document type. Use: insurance, registration, pollution", 400);
  if (!req.file) throw new AppError("No document uploaded", 400);

  const { expiryDate } = req.body;
  const update = {
    [`documents.${docType}.url`]: req.file.path,
    [`documents.${docType}.verified`]: false,
  };
  if (expiryDate) {
    const parsedExpiry = new Date(expiryDate);
    if (isNaN(parsedExpiry.getTime())) throw new AppError('Invalid expiry date', 400);
    update[`documents.${docType}.expiryDate`] = parsedExpiry;
  }

  const car = await Car.findByIdAndUpdate(id, update, { new: true });
  if (!car) throw new AppError("Car not found", 404);

  res.json({ success: true, message: `${docType} document uploaded`, data: { documents: car.documents } });
};

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

  res.json({ success: true, message: `${docType} document verified`, data: { documents: car.documents } });
};

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
