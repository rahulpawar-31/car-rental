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

// All lock timing is judged by the database's own clock ($$NOW), never by an application server's,
// so servers with different clocks agree on whether a lease is still valid.
const leaseExpired = { $expr: { $lte: ["$expiresAt", "$$NOW"] } };
const leaseValid = { $expr: { $gt: ["$expiresAt", "$$NOW"] } };

/** One attempt to take the car's lock. Returns false when another claim holds it. */
async function tryAcquire(carId, owner, leaseMs) {
  // Atomic: of several claims finding the same expired lock, one matches and the rest get null.
  const takeOver = () =>
    ReservationLock.findOneAndUpdate({ car: carId, ...leaseExpired }, [
      { $set: { owner, expiresAt: { $add: ["$$NOW", leaseMs] } } },
    ]);

  if (await takeOver()) return true;

  // No lock document for this car yet (a live lock would still be there). Add one that is already
  // expired, then compete for it like any other expired lock; the unique key on `car` stops
  // two claims each adding their own.
  if (!(await ReservationLock.exists({ car: carId }))) {
    try {
      await ReservationLock.create({ car: carId, owner: "", expiresAt: new Date(0) });
    } catch (err) {
      if (err?.code !== DUPLICATE_KEY) throw err;
    }
    return Boolean(await takeOver());
  }
  return false;
}

/**
 * Runs `fn` while holding the car's reservation lock, so claims for the same car (new bookings
 * and reschedules, from any request or process) run one at a time. Availability is only
 * trustworthy if the conflict check and the write that follows it happen inside this.
 *
 * It is a lease, not a transaction: it works on any MongoDB deployment, and a crashed holder
 * cannot block the car for longer than `leaseMs`. Because a lease can run out while `fn` is still
 * in flight (a stalled write), the lease alone does not keep a late write from overlapping one made
 * by whoever took over. So `fn` must call `lock.assertHeld()` after its write has completed and undo
 * the write if that throws: a write that finished while the lease was still valid is visible to
 * any claim that can take the lock afterwards, and a write that did not is rolled back.
 *
 * @template T
 * @param {any} carId
 * @param {(lock: { assertHeld: () => Promise<void> }) => Promise<T>} fn
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

  const lock = {
    async assertHeld() {
      const held = await ReservationLock.exists({ car: carId, owner, ...leaseValid });
      if (!held) {
        throw new AppError("This booking took too long to process and was not saved. Please try again.", 409);
      }
    },
  };

  try {
    return await fn(lock);
  } finally {
    // Only removes our own lock; if the lease expired and someone took over, this matches nothing.
    await ReservationLock.deleteOne({ car: carId, owner }).catch((err) =>
      logger.error(`Could not release the reservation lock for car ${carId}: ${err.message}`)
    );
  }
}
