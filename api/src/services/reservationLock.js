import { randomUUID } from "node:crypto";
import ReservationLock from "../model/reservationLock.model.js";
import { AppError } from "../middleware/errorHandler.js";
import { logger } from "../utils/logger.js";
import { inTransaction } from "./transaction.js";

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
    ], { session: null });

  if (await takeOver()) return true;

  // No lock document for this car yet (a live lock would still be there). Add one that is already
  // expired, then compete for it like any other expired lock; the unique key on `car` stops
  // two claims each adding their own.
  if (!(await ReservationLock.exists({ car: carId }, { session: null }))) {
    try {
      await ReservationLock.create([{ car: carId, owner: "", expiresAt: new Date(0) }], { session: null });
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
 * The callback's writes stay private until commit. A conditional write to the lock document in
 * the SAME transaction fences the commit against lease takeover/TTL deletion. A lost lease aborts
 * the transaction; no compensating delete or restore can reclaim dates or overwrite paid prices.
 * Requires a MongoDB replica set (including a single-node set for local development).
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
    return await inTransaction(async () => {
      await lock.assertHeld();
      const result = await fn(lock);
      // A read alone is insufficient: another owner can acquire after our snapshot was taken.
      // Writing the shared lock row makes takeover conflict with this commit. The driver retries
      // transient conflicts with a fresh snapshot, which rechecks both availability and ownership.
      const held = await ReservationLock.findOneAndUpdate(
        { car: carId, owner, ...leaseValid },
        { $inc: { revision: 1 } },
        { new: true }
      );
      if (!held) throw new AppError("This booking took too long to process and was not saved. Please try again.", 409);
      return result;
    });
  } finally {
    // Only removes our own lock; if the lease expired and someone took over, this matches nothing.
    await ReservationLock.deleteOne({ car: carId, owner }, { session: null }).catch((err) =>
      logger.error(`Could not release the reservation lock for car ${carId}: ${err.message}`)
    );
  }
}
