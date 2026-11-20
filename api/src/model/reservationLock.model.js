import mongoose from "mongoose";

// One short-lived document per car that is currently having a booking claimed. The unique key on
// `car` is what makes claims for the same car take turns (see services/reservationLock.js).
const reservationLockSchema = new mongoose.Schema({
  car: { type: mongoose.Schema.Types.ObjectId, ref: "Car", required: true, unique: true },
  // Empty on the already-expired placeholder a first claim competes for.
  owner: { type: String, default: "" },
  expiresAt: { type: Date, required: true },
  revision: { type: Number, default: 0 },
});

// Sweeps up locks a crashed request never released. Takeover of an expired lock does not wait for
// this, it only keeps the collection tidy.
reservationLockSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 60 });

const ReservationLock = mongoose.model("ReservationLock", reservationLockSchema);
export default ReservationLock;
