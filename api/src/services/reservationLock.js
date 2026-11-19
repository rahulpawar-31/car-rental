import { randomUUID } from "node:crypto";
import ReservationLock from "../model/reservationLock.model.js";
import { AppError } from "../middleware/errorHandler.js";
import { logger } from "../utils/logger.js";

const DEFAULTS = {
  // Longer than any claim should take. If a process dies holding the lock, the next claim for
  // the car takes it over once this has passed.
  leaseMs: 15_000,
  // How long a claim waits its turn before giving up with a "try again".
  waitMs: 8_000,
  retryMs: 40,
};

const DUPLICATE_KEY = 11000;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** One attempt to take the car's lock. Returns false when another claim holds it. */
async function tryAcquire(carId, owner, leaseMs) {
  const now = new Date();
  const lease = { owner, expiresAt: new Date(now.getTime() + leaseMs) };
  try {
    // Take over a lock whose lease has run out. The filter makes this atomic: of several claims
    // finding the same expired lock, one matches and the rest get null.
    const takenOver = await ReservationLock.findOneAndUpdate({ car: carId, expiresAt: { $lte: now } }, { $set: lease });
    if (takenOver) return true;

    // No lock yet (or a live one). The unique key on `car` lets exactly one create succeed.
    await ReservationLock.create({ car: carId, ...lease });
    return true;
  } catch (err) {
    if (err?.code === DUPLICATE_KEY) return false;
    throw err;
  }
}

/**
 * Runs `fn` while holding the car's reservation lock, so claims for the same car (new bookings
 * and reschedules, from any request or process) run one at a time. Availability is only
 * trustworthy if the conflict check and the write that follows it happen inside this.
 *
 * It is a lease, not a transaction: it works on any MongoDB deployment, and a crashed holder
 * cannot block the car for longer than `leaseMs`.
 *
 * @template T
 * @param {any} carId
 * @param {() => Promise<T>} fn
 * @param {{ leaseMs?: number, waitMs?: number, retryMs?: number }} [options]
 * @returns {Promise<T>}
 */
export async function withCarLock(carId, fn, options = {}) {
  const { leaseMs, waitMs, retryMs } = { ...DEFAULTS, ...options };
  const owner = randomUUID();
  const giveUpAt = Date.now() + waitMs;

  while (!(await tryAcquire(carId, owner, leaseMs))) {
    if (Date.now() >= giveUpAt) {
      throw new AppError("Another booking for this car is being processed right now. Please try again.", 409);
    }
    await sleep(retryMs * (0.5 + Math.random()));
  }

  try {
    return await fn();
  } finally {
    // Only removes our own lock; if the lease expired and someone took over, this matches nothing.
    await ReservationLock.deleteOne({ car: carId, owner }).catch((err) =>
      logger.error(`Could not release the reservation lock for car ${carId}: ${err.message}`)
    );
  }
}
