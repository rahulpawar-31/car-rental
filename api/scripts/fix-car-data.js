// One-off data repair for cars that were inserted outside the Mongoose model (see #84, #81):
//   1. `location` stored as a string instead of an ObjectId, so location filters never match.
//   2. `createdAt` / `updatedAt` missing, so "Newest First" puts those cars last.
//
// It reads and writes the raw collection on purpose: going through the Car model would cast
// the values and hide the problem.
//
// Usage (from api/):
//   node scripts/fix-car-data.js            dry run: prints what it WOULD change, writes nothing
//   node scripts/fix-car-data.js --apply    makes the changes
//
// It connects with MONGO_URL from api/.env, the same as the server. Take an Atlas backup or
// snapshot before running it with --apply. Never run `npm run seed` against a live database:
// the seed deletes every user, car, booking and review first.
import "dotenv/config";
import mongoose from "mongoose";

const apply = process.argv.includes("--apply");
const { ObjectId } = mongoose.Types;

if (!process.env.MONGO_URL) {
  console.error("MONGO_URL is not set (check api/.env).");
  process.exit(1);
}

await mongoose.connect(process.env.MONGO_URL);
const db = mongoose.connection.db;
const cars = db.collection("cars");
const locations = db.collection("locations");

// Never print the connection string, it contains the database password.
console.log(`Connected to database "${db.databaseName}". Mode: ${apply ? "APPLY" : "dry run (no writes)"}\n`);

const knownLocationIds = new Set((await locations.find({}, { projection: { _id: 1 } }).toArray()).map((l) => String(l._id)));

// ── 1. location stored as a string ─────────────────────────────────────────────
const stringLocation = await cars.find({ location: { $type: "string" } }, { projection: { name: 1, location: 1 } }).toArray();
const fixable = stringLocation.filter((c) => ObjectId.isValid(c.location) && knownLocationIds.has(c.location));
const unfixable = stringLocation.filter((c) => !fixable.includes(c));

console.log(`Cars with a string location: ${stringLocation.length}`);
console.log(`  can be converted to an ObjectId: ${fixable.length}`);
if (unfixable.length) {
  console.log(`  NOT touched (value is not the id of an existing location): ${unfixable.length}`);
  for (const c of unfixable) console.log(`    ${c._id}  ${c.name}  location=${JSON.stringify(c.location)}`);
}

if (apply && fixable.length) {
  const result = await cars.bulkWrite(
    fixable.map((c) => ({ updateOne: { filter: { _id: c._id }, update: { $set: { location: new ObjectId(c.location) } } } }))
  );
  console.log(`  converted: ${result.modifiedCount}`);
}

// ── 2. missing createdAt / updatedAt ───────────────────────────────────────────
// The date is taken from the timestamp inside each car's _id, i.e. when it was really created.
const missingDates = await cars.find({ createdAt: { $exists: false } }, { projection: { name: 1 } }).toArray();
console.log(`\nCars without createdAt: ${missingDates.length}`);

if (apply && missingDates.length) {
  const result = await cars.bulkWrite(
    missingDates.map((c) => {
      const created = c._id.getTimestamp();
      return { updateOne: { filter: { _id: c._id }, update: { $set: { createdAt: created, updatedAt: created } } } };
    })
  );
  console.log(`  backfilled: ${result.modifiedCount}`);
}

// ── Result: cars per location after the change ─────────────────────────────────
console.log("\nActive cars per location" + (apply ? " (after the change)" : " (current, before any change)") + ":");
const perLocation = await cars.aggregate([
  { $match: { isActive: true, location: { $type: "objectId" } } },
  { $group: { _id: "$location", count: { $sum: 1 } } },
]).toArray();
const counts = new Map(perLocation.map((r) => [String(r._id), r.count]));
for (const l of await locations.find({}, { projection: { name: 1 } }).toArray()) {
  console.log(`  ${l.name}: ${counts.get(String(l._id)) ?? 0}`);
}

if (!apply) console.log("\nDry run only. Re-run with --apply to make these changes.");
await mongoose.disconnect();
