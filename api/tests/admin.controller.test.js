import { describe, it, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import User from "../src/model/user.model.js";
import Car from "../src/model/car.model.js";
import Booking from "../src/model/booking.model.js";
import Review from "../src/model/review.model.js";
import Coupon from "../src/model/coupon.model.js";
import * as admin from "../src/controllers/admin.controller.js";

afterEach(() => mock.restoreAll());

const chain = (result) => {
  const q = {
    populate: () => q, sort: () => q, skip: () => q, limit: () => q, select: () => q,
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
  };
  return q;
};

// A response double that records what the controller sent.
const run = async (handler, req) => {
  const sent = { status: 200 };
  const res = {
    status(code) { sent.status = code; return res; },
    json(body) { sent.body = body; return res; },
  };
  await handler({ query: {}, params: {}, body: {}, user: { _id: "admin1" }, ...req }, res);
  return sent;
};

// These pin the response shapes and messages the admin UI reads, so moving the logic into
// services/ can't change what the client receives.
describe("admin controller responses", () => {
  it("getAllUsers wraps the page and pagination in data", async () => {
    mock.method(User, "find", () => chain([{ _id: "u1" }]));
    mock.method(User, "countDocuments", async () => 1);

    const { body } = await run(admin.getAllUsers, { query: { page: "1", limit: "20" } });

    assert.equal(body.success, true);
    assert.deepEqual(Object.keys(body.data), ["users", "pagination"]);
    assert.deepEqual(body.data.pagination, { page: 1, limit: 20, total: 1, pages: 1 });
  });

  it("toggleUserStatus words its message from the new state", async () => {
    const user = { role: "user", isActive: true, save: async () => {} };
    mock.method(User, "findById", async () => user);

    const off = await run(admin.toggleUserStatus, { params: { id: "u1" } });
    const on = await run(admin.toggleUserStatus, { params: { id: "u1" } });

    assert.equal(off.body.message, "User deactivated");
    assert.deepEqual(off.body.data, { isActive: false });
    assert.equal(on.body.message, "User activated");
  });

  it("getAllBookings returns bookings and pagination", async () => {
    mock.method(Booking, "find", () => chain([]));
    mock.method(Booking, "countDocuments", async () => 0);

    const { body } = await run(admin.getAllBookings, {});

    assert.deepEqual(Object.keys(body.data), ["bookings", "pagination"]);
  });

  it("updateBookingStatus returns the booking under data.booking", async () => {
    const booking = { status: "pending", save: async () => {} };
    mock.method(Booking, "findById", async () => booking);

    const { body } = await run(admin.updateBookingStatus, { params: { id: "b1" }, body: { status: "confirmed" } });

    assert.equal(body.message, "Booking updated");
    assert.equal(body.data.booking, booking);
  });

  it("approveReview words its message from the request, not the stored review", async () => {
    mock.method(Review, "findByIdAndUpdate", async () => ({ _id: "r1" }));

    const approved = await run(admin.approveReview, { params: { id: "r1" }, body: { approved: true } });
    const rejected = await run(admin.approveReview, { params: { id: "r1" }, body: { approved: false } });

    assert.equal(approved.body.message, "Review approved");
    assert.equal(rejected.body.message, "Review rejected");
    assert.deepEqual(rejected.body.data, { review: { _id: "r1" } });
  });

  it("createCoupon answers 201 and attributes the coupon to the signed-in admin", async () => {
    const create = mock.method(Coupon, "create", async (doc) => ({ _id: "c1", ...doc }));

    const { status, body } = await run(admin.createCoupon, { body: { code: "SAVE" }, user: { _id: "admin7" } });

    assert.equal(status, 201);
    assert.equal(body.message, "Coupon created");
    assert.equal(create.mock.calls[0].arguments[0].createdBy, "admin7");
  });

  it("getCoupons, updateCoupon and deleteCoupon keep their shapes", async () => {
    mock.method(Coupon, "find", () => chain([{ _id: "c1" }]));
    mock.method(Coupon, "findByIdAndUpdate", async () => ({ _id: "c1" }));
    mock.method(Coupon, "findByIdAndDelete", async () => null);

    assert.deepEqual((await run(admin.getCoupons, {})).body, { success: true, data: { coupons: [{ _id: "c1" }] } });
    assert.deepEqual((await run(admin.updateCoupon, { params: { id: "c1" } })).body, {
      success: true, message: "Coupon updated", data: { coupon: { _id: "c1" } },
    });
    assert.deepEqual((await run(admin.deleteCoupon, { params: { id: "c1" } })).body, { success: true, message: "Coupon deleted" });
  });

  it("getFleetStats returns the four breakdowns directly under data", async () => {
    mock.method(Car, "aggregate", async () => []);
    mock.method(Car, "find", () => chain([]));

    const { body } = await run(admin.getFleetStats, {});

    assert.deepEqual(Object.keys(body.data), ["carsByType", "carsByLocation", "carsByStatus", "topRentedCars"]);
  });
});
