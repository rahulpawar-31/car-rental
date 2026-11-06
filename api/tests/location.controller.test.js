import { describe, it, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import Location from "../src/model/location.model.js";
import Car from "../src/model/car.model.js";
import * as controller from "../src/controllers/location.controller.js";

afterEach(() => mock.restoreAll());

const chain = (result) => {
  const q = {
    sort: () => q,
    lean: () => q,
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
  };
  return q;
};

const run = async (handler, req) => {
  const sent = { status: 200 };
  const res = {
    status(code) { sent.status = code; return res; },
    json(body) { sent.body = body; return res; },
  };
  await handler({ query: {}, params: {}, body: {}, ...req }, res);
  return sent;
};

describe("getLocations car counts", () => {
  it("reports the live number of active cars per branch, not the stored carCount", async () => {
    mock.method(Location, "find", () =>
      chain([
        { _id: "l1", name: "Pune Kothrud", carCount: 3 },
        { _id: "l2", name: "Mumbai Airport", carCount: 4 },
        { _id: "l3", name: "Empty Branch", carCount: 9 },
      ])
    );
    const aggregate = mock.method(Car, "aggregate", async () => [
      { _id: "l1", count: 12 },
      { _id: "l2", count: 14 },
    ]);

    const { body } = await run(controller.getLocations, {});

    assert.deepEqual(
      body.data.locations.map((l) => [l.name, l.carCount]),
      [["Pune Kothrud", 12], ["Mumbai Airport", 14], ["Empty Branch", 0]]
    );
    const [pipeline] = aggregate.mock.calls[0].arguments;
    assert.deepEqual(pipeline[0].$match, { isActive: true, location: { $in: ["l1", "l2", "l3"] } });
  });
});
