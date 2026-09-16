import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true, minlength: 8, select: false },
    phone: { type: String, trim: true },
    avatar: { type: String, default: "" },
    avatarPublicId: { type: String, default: "" },
    role: { type: String, enum: ["user", "admin"], default: "user" },
    isVerified: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    otp: { type: String, select: false },
    otpExpiry: { type: Date, select: false },
    refreshToken: { type: String, select: false },
    savedCars: [{ type: mongoose.Schema.Types.ObjectId, ref: "Car" }],
    savedLocations: [{ type: mongoose.Schema.Types.ObjectId, ref: "Location" }],
    drivingLicense: {
      number: String,
      expiryDate: Date,
      imageUrl: String,
      imagePublicId: String,
      verified: { type: Boolean, default: false },
    },
    address: {
      street: String,
      city: String,
      state: String,
      country: String,
      zipCode: String,
    },
    passwordChangedAt: Date,
    passwordResetToken: { type: String, select: false },
    passwordResetExpiry: { type: Date, select: false },
  },
  { timestamps: true }
);

userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

userSchema.methods.changedPasswordAfter = function (jwtTimestamp) {
  if (this.passwordChangedAt) {
    const changedTimestamp = parseInt(this.passwordChangedAt.getTime() / 1000, 10);
    return jwtTimestamp < changedTimestamp;
  }
  return false;
};

const User = mongoose.model("User", userSchema);
export default User;
