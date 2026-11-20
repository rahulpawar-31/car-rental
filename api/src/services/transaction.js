import mongoose from "mongoose";

// Mongoose attaches this transaction's session to every query/save in the async callback.
// This also covers model hooks, so an accidentally omitted session cannot leak a partial write.
mongoose.set("transactionAsyncLocalStorage", true);

export const inTransaction = (fn) => mongoose.connection.transaction(fn, {
  readConcern: { level: "snapshot" },
  writeConcern: { w: "majority" },
  readPreference: "primary",
});
