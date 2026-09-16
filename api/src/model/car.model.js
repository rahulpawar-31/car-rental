import mongoose from "mongoose";

const carSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    brand: { type: String, required: true, trim: true },
    model: { type: String, required: true, trim: true },
    year: { type: Number, required: true },
    type: {
      type: String,
      enum: [
        "sedan",
        "suv",
        "hatchback",
        "coupe",
        "convertible",
        "van",
        "truck",
        "luxury",
        "electric",
        "hybrid",
      ],
      required: true,
    },
    transmission: {
      type: String,
      enum: ["automatic", "manual"],
      required: true,
    },
    fuelType: {
      type: String,
      enum: ["petrol", "diesel", "electric", "hybrid", "cng"],
      required: true,
    },
    seats: { type: Number, required: true },
    doors: { type: Number, default: 4 },
    color: { type: String },
    licensePlate: { type: String, unique: true, sparse: true },
    vin: { type: String, unique: true, sparse: true },
    mileage: { type: Number, default: 0 },
    pricePerDay: { type: Number, required: true },
    pricePerHour: { type: Number },
    securityDeposit: { type: Number, default: 0 },
    images: [
      {
        url: { type: String, required: true },
        publicId: String,
        isPrimary: { type: Boolean, default: false },
      },
    ],
    features: [String],
    description: { type: String },
    location: { type: mongoose.Schema.Types.ObjectId, ref: "Location" },
    isAvailable: { type: Boolean, default: true },
    isActive: { type: Boolean, default: true },
    rating: { type: Number, default: 0, min: 0, max: 5 },
    reviewCount: { type: Number, default: 0 },
    totalRentals: { type: Number, default: 0 },
    documents: {
      insurance: {
        url: String,
        publicId: String,
        expiryDate: Date,
        verified: { type: Boolean, default: false },
      },
      registration: {
        url: String,
        publicId: String,
        expiryDate: Date,
        verified: { type: Boolean, default: false },
      },
      pollution: {
        url: String,
        publicId: String,
        expiryDate: Date,
        verified: { type: Boolean, default: false },
      },
    },
    specifications: {
      engine: String,
      power: String,
      torque: String,
      topSpeed: String,
      acceleration: String,
      fuelEfficiency: String,
      bootSpace: String,
      groundClearance: String,
    },
    tags: [String],
    isFeatured: { type: Boolean, default: false },
  },
  { timestamps: true },
);

carSchema.index({ location: 1, isAvailable: 1, isActive: 1 });
carSchema.index({ brand: 1, type: 1 });
carSchema.index({ pricePerDay: 1 });
carSchema.index({
  name: "text",
  brand: "text",
  model: "text",
  description: "text",
});

const Car = mongoose.model("Car", carSchema);
export default Car;
