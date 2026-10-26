import { describe, it, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import User from "../src/model/user.model.js";
import Car from "../src/model/car.model.js";
import Booking from "../src/model/booking.model.js";
import Payment from "../src/model/payment.model.js";
import Review from "../src/model/review.model.js";
import Coupon from "../src/model/coupon.model.js";
import {
  paginationMeta,
  ALLOWED_STATUS_TRANSITIONS,
  assertStatusTransition,
  listUsers,
  toggleUserStatus,
  listBookings,
  updateBookingStatus,
  listPayments,
  listReviews,
  moderateReview,
  createCoupon,
  listCoupons,
  updateCoupon,
  deleteCoupon,
} from "../src/services/admin.js";
import { growthPercent, getDashboardStats, getFleetStats } from "../src/services/adminStats.js";

afterEach(() => mock.restoreAll());

// Query-builder stand-in: every chained call returns itself and awaiting it yields `result`.
function chain(result) {
  const q = {
    populate: () => q,
    sort: () => q,
    skip: () => q,
    limit: () => q,
    select: () => q,
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
  };
  return q;
}

async function rejectsWith(promise, status, message) {
  await assert.rejects(promise, (err) => {
    assert.equal(err.statusCode, status);
    if (message) assert.equal(err.message, message);
    return true;
  });
}

describe("paginationMeta", () => {
  it("parses string page/limit from the query and rounds pages up", () => {
    assert.deepEqual(paginationMeta("2", "20", 45), { page: 2, limit: 20, total: 45, pages: 3 });
    assert.deepEqual(paginationMeta(1, 10, 0), { page: 1, limit: 10, total: 0, pages: 0 });
  });
});

describe("growthPercent", () => {
  it("is the percentage change from the previous value", () => {
    assert.equal(growthPercent(150, 100), 50);
    assert.equal(growthPercent(50, 100), -50);
  });

  it("is 0 when there is no previous value to compare against", () => {
    assert.equal(growthPercent(100, 0), 0);
  });
});

describe("assertStatusTransition", () => {
  it("allows exactly the transitions in the table", () => {
    for (const [from, targets] of Object.entries(ALLOWED_STATUS_TRANSITIONS)) {
      for (const to of Object.keys(ALLOWED_STATUS_TRANSITIONS)) {
        if (targets.includes(to)) assert.doesNotThrow(() => assertStatusTransition(from, to), `${from} -> ${to}`);
        else assert.throws(() => assertStatusTransition(from, to), { statusCode: 400 }, `${from} -> ${to}`);
      }
    }
  });

  it("names both statuses in the error", () => {
    assert.throws(() => assertStatusTransition("completed", "pending"), {
      message: 'Cannot change booking status from "completed" to "pending"',
      statusCode: 400,
    });
  });

  it("treats an unknown current status as having no way forward", () => {
    assert.throws(() => assertStatusTransition("mystery", "confirmed"), { statusCode: 400 });
  });

  it("matches the lifecycle: finished and cancelled bookings are terminal", () => {
    assert.deepEqual(ALLOWED_STATUS_TRANSITIONS.completed, []);
    assert.deepEqual(ALLOWED_STATUS_TRANSITIONS.cancelled, []);
    assert.deepEqual(ALLOWED_STATUS_TRANSITIONS["no-show"], ["cancelled"]);
  });
});

describe("listUsers", () => {
  it("builds the filter from role, active and a regex-escaped search", async () => {
    const find = mock.method(User, "find", () => chain([{ _id: "u1" }]));
    mock.method(User, "countDocuments", async () => 41);

    const result = await listUsers({ page: "2", limit: "20", role: "user", active: "false", search: "a.b" });

    const query = find.mock.calls[0].arguments[0];
    assert.equal(query.role, "user");
    assert.equal(query.isActive, false);
    assert.equal(query.$or.length, 2);
    assert.equal(query.$or[0].name.source, "a\\.b", "regex metacharacters in the search are escaped");
    assert.equal(query.$or[0].name.flags, "i");
    assert.deepEqual(result.pagination, { page: 2, limit: 20, total: 41, pages: 3 });
    assert.equal(result.users.length, 1);
  });

  it("applies no filter by default and pages 20 at a time", async () => {
    const find = mock.method(User, "find", () => chain([]));
    mock.method(User, "countDocuments", async () => 0);

    const result = await listUsers({});

    assert.deepEqual(find.mock.calls[0].arguments[0], {});
    assert.equal(result.pagination.limit, 20);
    assert.equal(result.pagination.page, 1);
  });

  it("reads active=true as a flag, not a truthy string", async () => {
    const find = mock.method(User, "find", () => chain([]));
    mock.method(User, "countDocuments", async () => 0);

    await listUsers({ active: "true" });

    assert.equal(find.mock.calls[0].arguments[0].isActive, true);
  });
});

describe("toggleUserStatus", () => {
  it("404s for an unknown user", async () => {
    mock.method(User, "findById", async () => null);
    await rejectsWith(toggleUserStatus("u1"), 404, "User not found");
  });

  it("refuses to deactivate an admin", async () => {
    const admin = { role: "admin", isActive: true, save: mock.fn(async () => {}) };
    mock.method(User, "findById", async () => admin);

    await rejectsWith(toggleUserStatus("u1"), 400, "Cannot deactivate admin");
    assert.equal(admin.save.mock.callCount(), 0);
    assert.equal(admin.isActive, true);
  });

  it("flips the flag both ways and saves without full validation", async () => {
    const user = { role: "user", isActive: true, save: mock.fn(async () => {}) };
    mock.method(User, "findById", async () => user);

    assert.deepEqual(await toggleUserStatus("u1"), { isActive: false });
    assert.deepEqual(await toggleUserStatus("u1"), { isActive: true });
    assert.deepEqual(user.save.mock.calls[0].arguments[0], { validateBeforeSave: false });
  });
});

describe("listBookings", () => {
  it("filters by status and returns the page with pagination", async () => {
    const find = mock.method(Booking, "find", () => chain([{ _id: "b1" }]));
    mock.method(Booking, "countDocuments", async () => 1);

    const result = await listBookings({ status: "confirmed" });

    assert.deepEqual(find.mock.calls[0].arguments[0], { status: "confirmed" });
    assert.deepEqual(result.pagination, { page: 1, limit: 20, total: 1, pages: 1 });
  });

  it("searches by matching users (name/email) or booking number, with the search escaped", async () => {
    const userFind = mock.method(User, "find", () => chain([{ _id: "u1" }, { _id: "u2" }]));
    const find = mock.method(Booking, "find", () => chain([]));
    mock.method(Booking, "countDocuments", async () => 0);

    await listBookings({ search: "BK-1(a)" });

    const userQuery = userFind.mock.calls[0].arguments[0];
    assert.equal(userQuery.$or[0].name.source, "BK-1\\(a\\)");
    const query = find.mock.calls[0].arguments[0];
    assert.deepEqual(query.$or[0], { user: { $in: ["u1", "u2"] } });
    assert.equal(query.$or[1].bookingNumber.source, "BK-1\\(a\\)");
    assert.equal(query.$or[1].bookingNumber.flags, "i");
  });

  it("skips the user lookup when there is no search", async () => {
    const userFind = mock.method(User, "find", () => assert.fail("must not search users"));
    mock.method(Booking, "find", () => chain([]));
    mock.method(Booking, "countDocuments", async () => 0);

    await listBookings({});

    assert.equal(userFind.mock.callCount(), 0);
  });
});

describe("updateBookingStatus", () => {
  const booking = (overrides = {}) => ({
    status: "pending",
    car: "car1",
    paymentStatus: "pending",
    totalAmount: 10000,
    securityDeposit: 2000,
    save: mock.fn(async () => {}),
    ...overrides,
  });

  it("404s for an unknown booking", async () => {
    mock.method(Booking, "findById", async () => null);
    await rejectsWith(updateBookingStatus("b1", { status: "confirmed" }), 404, "Booking not found");
  });

  it("rejects a disallowed transition without saving", async () => {
    const b = booking({ status: "completed" });
    mock.method(Booking, "findById", async () => b);

    await rejectsWith(updateBookingStatus("b1", { status: "pending" }), 400, 'Cannot change booking status from "completed" to "pending"');
    assert.equal(b.save.mock.callCount(), 0);
    assert.equal(b.status, "completed");
  });

  it("applies an allowed transition", async () => {
    const b = booking();
    mock.method(Booking, "findById", async () => b);

    const result = await updateBookingStatus("b1", { status: "confirmed" });

    assert.equal(result, b);
    assert.equal(b.status, "confirmed");
    assert.equal(b.save.mock.callCount(), 1);
  });

  it("records who/when/why on cancellation, preferring an existing reason, then the note, then a default", async () => {
    const withReason = booking({ cancellationReason: "customer asked" });
    mock.method(Booking, "findById", async () => withReason);
    await updateBookingStatus("b1", { status: "cancelled", adminNotes: "note" });
    assert.equal(withReason.cancellationReason, "customer asked");
    assert.equal(withReason.cancelledBy, "admin");
    assert.ok(withReason.cancelledAt instanceof Date);

    const withNote = booking();
    mock.method(Booking, "findById", async () => withNote);
    await updateBookingStatus("b1", { status: "cancelled", adminNotes: "no car available" });
    assert.equal(withNote.cancellationReason, "no car available");

    const bare = booking();
    mock.method(Booking, "findById", async () => bare);
    await updateBookingStatus("b1", { status: "cancelled" });
    assert.equal(bare.cancellationReason, "Cancelled by admin");
  });

  it("refunds everything but the deposit when cancelling a paid booking with no refund yet", async () => {
    const paid = booking({ paymentStatus: "paid" });
    mock.method(Booking, "findById", async () => paid);
    await updateBookingStatus("b1", { status: "cancelled" });
    assert.equal(paid.refundAmount, 8000);

    const alreadyRefunded = booking({ paymentStatus: "paid", refundAmount: 500 });
    mock.method(Booking, "findById", async () => alreadyRefunded);
    await updateBookingStatus("b1", { status: "cancelled" });
    assert.equal(alreadyRefunded.refundAmount, 500, "an existing refund amount is left alone");

    const unpaid = booking();
    mock.method(Booking, "findById", async () => unpaid);
    await updateBookingStatus("b1", { status: "cancelled" });
    assert.equal("refundAmount" in unpaid, false);
  });

  it("counts a completed rental against the car", async () => {
    const b = booking({ status: "active" });
    mock.method(Booking, "findById", async () => b);
    const bump = mock.method(Car, "findByIdAndUpdate", async () => ({}));

    await updateBookingStatus("b1", { status: "completed" });

    assert.deepEqual(bump.mock.calls[0].arguments, ["car1", { $inc: { totalRentals: 1 } }]);
  });

  it("updates only the note when no status is given, and can clear it", async () => {
    const b = booking({ adminNotes: "old" });
    mock.method(Booking, "findById", async () => b);
    const bump = mock.method(Car, "findByIdAndUpdate", async () => ({}));

    await updateBookingStatus("b1", { adminNotes: "" });

    assert.equal(b.status, "pending");
    assert.equal(b.adminNotes, "");
    assert.equal(bump.mock.callCount(), 0);
  });

  it("treats the same status as a no-op rather than a transition", async () => {
    const b = booking({ status: "completed" });
    mock.method(Booking, "findById", async () => b);

    await updateBookingStatus("b1", { status: "completed", adminNotes: "n" });

    assert.equal(b.adminNotes, "n");
    assert.equal(b.save.mock.callCount(), 1);
  });
});

describe("listPayments", () => {
  it("returns the page plus total revenue from successful payments", async () => {
    const find = mock.method(Payment, "find", () => chain([{ _id: "p1" }]));
    mock.method(Payment, "countDocuments", async () => 1);
    const aggregate = mock.method(Payment, "aggregate", async () => [{ _id: null, total: 12345 }]);

    const result = await listPayments({ status: "succeeded", limit: "50" });

    assert.deepEqual(find.mock.calls[0].arguments[0], { status: "succeeded" });
    assert.equal(aggregate.mock.calls[0].arguments[0][0].$match.status, "succeeded");
    assert.equal(result.totalRevenue, 12345);
    assert.equal(result.pagination.limit, 50);
  });

  it("reports 0 revenue when there are no successful payments", async () => {
    mock.method(Payment, "find", () => chain([]));
    mock.method(Payment, "countDocuments", async () => 0);
    mock.method(Payment, "aggregate", async () => []);

    assert.equal((await listPayments({})).totalRevenue, 0);
  });
});

describe("listReviews", () => {
  const filterFor = async (status) => {
    const find = mock.method(Review, "find", () => chain([]));
    mock.method(Review, "countDocuments", async () => 0);
    await listReviews({ status });
    const query = find.mock.calls[0].arguments[0];
    mock.restoreAll();
    return query;
  };

  it("maps the status tabs onto review flags", async () => {
    assert.deepEqual(await filterFor("pending"), { isApproved: false });
    assert.deepEqual(await filterFor("approved"), { isApproved: true });
    assert.deepEqual(await filterFor("flagged"), { isFlagged: true });
  });

  it("applies no filter for anything else", async () => {
    assert.deepEqual(await filterFor(undefined), {});
    assert.deepEqual(await filterFor("all"), {});
  });
});

describe("moderateReview", () => {
  it("sets approval and the admin response, returning the updated review", async () => {
    const update = mock.method(Review, "findByIdAndUpdate", async () => ({ _id: "r1", isApproved: true }));

    const review = await moderateReview("r1", { approved: true, response: "Thanks!" });

    assert.deepEqual(update.mock.calls[0].arguments, ["r1", { isApproved: true, adminResponse: "Thanks!" }, { new: true }]);
    assert.equal(review.isApproved, true);
  });

  it("404s for an unknown review", async () => {
    mock.method(Review, "findByIdAndUpdate", async () => null);
    await rejectsWith(moderateReview("r1", { approved: false }), 404, "Review not found");
  });
});

describe("coupons", () => {
  it("createCoupon stamps createdBy over anything in the fields", async () => {
    const create = mock.method(Coupon, "create", async (doc) => doc);

    await createCoupon({ code: "SAVE", createdBy: "someone-else" }, "admin1");

    assert.deepEqual(create.mock.calls[0].arguments[0], { code: "SAVE", createdBy: "admin1" });
  });

  it("listCoupons filters on active (as a string flag) and sorts newest first", async () => {
    const find = mock.method(Coupon, "find", () => chain([]));

    await listCoupons({ active: "false" });
    await listCoupons({});

    assert.deepEqual(find.mock.calls[0].arguments[0], { isActive: false });
    assert.deepEqual(find.mock.calls[1].arguments[0], {});
  });

  it("updateCoupon runs model validators and 404s for an unknown coupon", async () => {
    const update = mock.method(Coupon, "findByIdAndUpdate", async () => ({ _id: "c1" }));

    await updateCoupon("c1", { isActive: false });

    assert.deepEqual(update.mock.calls[0].arguments, ["c1", { isActive: false }, { new: true, runValidators: true }]);

    mock.method(Coupon, "findByIdAndUpdate", async () => null);
    await rejectsWith(updateCoupon("c1", {}), 404, "Coupon not found");
  });

  it("deleteCoupon deletes by id and does not 404 for a missing one", async () => {
    const del = mock.method(Coupon, "findByIdAndDelete", async () => null);

    await deleteCoupon("c1");

    assert.deepEqual(del.mock.calls[0].arguments, ["c1"]);
  });
});

describe("getDashboardStats", () => {
  // Answers each query by the filter/pipeline it is given, so the test doesn't depend on the
  // order the service happens to fire them in.
  const stubDashboard = ({ bookingsThisMonth = 30, bookingsLastMonth = 20, revenueThis = 1500, revenueLast = 1000 } = {}) => {
    mock.method(User, "countDocuments", async (f) => (f.createdAt ? 3 : 10));
    mock.method(Car, "countDocuments", async (f) => (f.isAvailable ? 7 : 9));
    mock.method(Booking, "countDocuments", async (f) => {
      if (!f) return 100;
      if (f.status === "active") return 4;
      return f.createdAt.$lt ? bookingsLastMonth : bookingsThisMonth;
    });
    mock.method(Review, "countDocuments", async () => 2);
    mock.method(Booking, "find", () => chain([{ _id: "recent" }]));
    mock.method(Booking, "aggregate", async () => [{ _id: "pending", count: 5 }]);
    mock.method(Payment, "aggregate", async (pipeline) => {
      if (pipeline.some((s) => s.$bucket)) {
        const now = new Date();
        return [{ _id: new Date(now.getFullYear(), now.getMonth(), 1), total: 99, count: 1 }];
      }
      const range = pipeline[0].$match.createdAt;
      const total = range.$lt ? revenueLast : revenueThis;
      return total === null ? [] : [{ _id: null, total }];
    });
  };

  it("assembles counts, revenue and month-on-month growth", async () => {
    stubDashboard();

    const data = await getDashboardStats();

    assert.deepEqual(data.stats, {
      totalUsers: 10,
      newUsersThisMonth: 3,
      totalCars: 9,
      availableCars: 7,
      totalBookings: 100,
      bookingsThisMonth: 30,
      activeBookings: 4,
      revenueThisMonth: 1500,
      revenueGrowth: "50.0",
      bookingGrowth: "50.0",
      pendingReviews: 2,
    });
    assert.deepEqual(data.recentBookings, [{ _id: "recent" }]);
    assert.deepEqual(data.bookingsByStatus, [{ _id: "pending", count: 5 }]);
    assert.equal(data.revenueByMonth.length, 1);
  });

  it("reports 0.0 growth, not Infinity/NaN, when last month had no revenue or bookings", async () => {
    stubDashboard({ revenueLast: null, bookingsLastMonth: 0 });

    const { stats } = await getDashboardStats();

    assert.equal(stats.revenueGrowth, "0.0");
    assert.equal(stats.bookingGrowth, "0.0");
  });

  it("reports 0 revenue when this month has no successful payments", async () => {
    stubDashboard({ revenueThis: null });

    const { stats } = await getDashboardStats();

    assert.equal(stats.revenueThisMonth, 0);
    assert.equal(stats.revenueGrowth, "-100.0");
  });
});

describe("getFleetStats", () => {
  it("returns the four breakdowns", async () => {
    mock.method(Car, "aggregate", async (pipeline) => {
      if (pipeline.some((s) => s.$lookup)) return [{ city: "Pune", name: "Airport", count: 3 }];
      return pipeline[1].$group._id === "$type" ? [{ _id: "sedan", count: 4 }] : [{ _id: true, count: 6 }];
    });
    mock.method(Car, "find", () => chain([{ name: "Honda City", totalRentals: 9 }]));

    const data = await getFleetStats();

    assert.deepEqual(data.carsByType, [{ _id: "sedan", count: 4 }]);
    assert.deepEqual(data.carsByLocation, [{ city: "Pune", name: "Airport", count: 3 }]);
    assert.deepEqual(data.carsByStatus, [{ _id: true, count: 6 }]);
    assert.deepEqual(data.topRentedCars, [{ name: "Honda City", totalRentals: 9 }]);
  });
});
