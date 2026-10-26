// @ts-check
import * as carService from "../services/car.js";

// uploadCarImages (upload.middleware.js) always uses multer's .array(), so req.files on the image
// routes is always Express.Multer.File[], never the fieldname-keyed shape multer's other
// .fields()/.any() modes produce.

/** @type {import('express').RequestHandler} */
export const getCars = async (req, res) => {
  // req.query values are typed string|string[]|ParsedQs by Express (query
  // strings can technically repeat/nest) -- every field this route reads is
  // always a plain string in practice, so cast once here rather than at
  // each usage site below.
  const params = /** @type {Record<string, string>} */ (req.query);
  const { cars, pagination } = await carService.listCars(params);

  res.json({ success: true, data: { cars, pagination } });
};

/** @type {import('express').RequestHandler} */
export const getCarById = async (req, res) => {
  const car = await carService.getCar(req.params.id);

  res.json({ success: true, data: { car } });
};

/** @type {import('express').RequestHandler} */
export const getFeaturedCars = async (req, res) => {
  const cars = await carService.getFeaturedCars();

  res.json({ success: true, data: { cars } });
};

/** @type {import('express').RequestHandler} */
export const getCarBookedDates = async (req, res) => {
  const bookedRanges = await carService.getBookedRanges(req.params.id);

  res.json({ success: true, data: { bookedRanges } });
};

/** @type {import('express').RequestHandler} */
export const checkCarAvailability = async (req, res) => {
  const dates = /** @type {Record<string, string>} */ (req.query);
  const available = await carService.isCarAvailable(req.params.id, dates);

  res.json({ success: true, data: { available } });
};

/** @type {import('express').RequestHandler} */
export const createCar = async (req, res) => {
  const files = /** @type {Express.Multer.File[] | undefined} */ (req.files);
  const car = await carService.createCar(req.body, files);

  res.status(201).json({ success: true, message: "Car created", data: { car } });
};

/** @type {import('express').RequestHandler} */
export const updateCar = async (req, res) => {
  const car = await carService.updateCar(req.params.id, req.body);

  res.json({ success: true, message: "Car updated", data: { car } });
};

/** @type {import('express').RequestHandler} */
export const addCarImages = async (req, res) => {
  const files = /** @type {Express.Multer.File[] | undefined} */ (req.files);
  const images = await carService.addCarImages(req.params.id, files);

  res.json({ success: true, message: "Images added", data: { images } });
};

/** @type {import('express').RequestHandler} */
export const deleteCarImage = async (req, res) => {
  await carService.deleteCarImage(req.params.id, req.params.imageId);

  res.json({ success: true, message: "Image deleted" });
};

/** @type {import('express').RequestHandler} */
export const deleteCar = async (req, res) => {
  await carService.deactivateCar(req.params.id);

  res.json({ success: true, message: "Car deactivated" });
};

/** @type {import('express').RequestHandler} */
export const uploadCarDocument = async (req, res) => {
  const { id, docType } = req.params;
  const documents = await carService.uploadCarDocument(id, docType, req.file, req.body.expiryDate);

  res.json({
    success: true,
    message: `${docType} document uploaded`,
    data: { documents },
  });
};

/** @type {import('express').RequestHandler} */
export const verifyCarDocument = async (req, res) => {
  const { id, docType } = req.params;
  const documents = await carService.verifyCarDocument(id, docType);

  res.json({
    success: true,
    message: `${docType} document verified`,
    data: { documents },
  });
};

/** @type {import('express').RequestHandler} */
export const getCarFilters = async (req, res) => {
  const data = await carService.getCarFilters();

  res.json({ success: true, data });
};
