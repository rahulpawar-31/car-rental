import User from "../model/user.model.js";
import Booking from "../model/booking.model.js";
import { AppError } from "../middleware/errorHandler.js";
import { deleteAsset, extractPublicIdFromUrl } from "../services/media.js";
import { clearTokenCookies } from "../utils/jwt.utils.js";

export const getProfile = async (req, res) => {
  const user = await User.findById(req.user._id)
    .populate("savedCars", "name brand model images pricePerDay rating")
    .populate("savedLocations", "name city address");

  res.json({ success: true, data: { user } });
};

export const updateProfile = async (req, res) => {
  const { name, phone, address } = req.body;

  const user = await User.findByIdAndUpdate(
    req.user._id,
    { name, phone, address },
    { new: true, runValidators: true }
  );

  res.json({ success: true, message: "Profile updated", data: { user } });
};

export const updateAvatar = async (req, res) => {
  if (!req.file) throw new AppError("No image uploaded", 400);

  const user = await User.findById(req.user._id);

  if (user.avatar) {
    const publicId = user.avatarPublicId || extractPublicIdFromUrl(user.avatar, "car-rental/profiles");
    await deleteAsset(publicId);
  }

  user.avatar = req.file.path;
  user.avatarPublicId = req.file.filename;
  await user.save({ validateBeforeSave: false });

  res.json({ success: true, message: "Avatar updated", data: { avatar: user.avatar } });
};

export const changePassword = async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  const user = await User.findById(req.user._id).select("+password");
  if (!(await user.comparePassword(currentPassword))) {
    throw new AppError("Current password is incorrect", 401);
  }

  user.password = newPassword;
  user.passwordChangedAt = new Date();
  user.refreshToken = undefined;
  await user.save();

  clearTokenCookies(res);
  res.json({ success: true, message: "Password changed successfully. Please log in again." });
};

export const getRentalHistory = async (req, res) => {
  const { page = 1, limit = 10, status } = req.query;

  const query = { user: req.user._id };
  if (status) query.status = status;

  const [bookings, total] = await Promise.all([
    Booking.find(query)
      .populate("car", "name brand model images")
      .populate("pickupLocation", "name city")
      .populate("dropLocation", "name city")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit)),
    Booking.countDocuments(query),
  ]);

  res.json({
    success: true,
    data: {
      bookings,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit),
      },
    },
  });
};

export const saveCar = async (req, res) => {
  const user = await User.findById(req.user._id);
  const { carId } = req.params;

  const idx = user.savedCars.findIndex((id) => id.toString() === carId);
  if (idx > -1) {
    user.savedCars.splice(idx, 1);
    await user.save({ validateBeforeSave: false });
    return res.json({ success: true, message: "Car removed from saved list", saved: false });
  }

  user.savedCars.push(carId);
  await user.save({ validateBeforeSave: false });
  res.json({ success: true, message: "Car saved", saved: true });
};

export const saveLocation = async (req, res) => {
  const user = await User.findById(req.user._id);
  const { locationId } = req.params;

  const idx = user.savedLocations.findIndex((id) => id.toString() === locationId);
  if (idx > -1) {
    user.savedLocations.splice(idx, 1);
    await user.save({ validateBeforeSave: false });
    return res.json({ success: true, message: "Location removed", saved: false });
  }

  user.savedLocations.push(locationId);
  await user.save({ validateBeforeSave: false });
  res.json({ success: true, message: "Location saved", saved: true });
};

export const updateDrivingLicense = async (req, res) => {
  const { number, expiryDate } = req.body;

  const updateData = { "drivingLicense.number": number, "drivingLicense.expiryDate": expiryDate };

  if (req.file) {
    const existing = await User.findById(req.user._id).select("drivingLicense");
    const oldImageUrl = existing?.drivingLicense?.imageUrl;
    if (oldImageUrl) {
      const publicId = existing.drivingLicense.imagePublicId || extractPublicIdFromUrl(oldImageUrl, "car-rental/documents");
      await deleteAsset(publicId);
    }
    updateData["drivingLicense.imageUrl"] = req.file.path;
    updateData["drivingLicense.imagePublicId"] = req.file.filename;
  }

  const user = await User.findByIdAndUpdate(req.user._id, updateData, { new: true });
  res.json({ success: true, message: "Driving license updated", data: { drivingLicense: user.drivingLicense } });
};
