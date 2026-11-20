import { mock } from "node:test";
import mongoose from "mongoose";

// These unit tests replace collection operations themselves. Transaction isolation/rollback is
// exercised against a real replica set in reservationLock.mongo.test.js and payment.atomic.mongo.test.js.
export const stubTransactions = (run = (fn) => fn()) => mock.method(mongoose.connection, "transaction", run);
