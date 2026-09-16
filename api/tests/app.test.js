import { describe, it } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import app from "../src/app.js";

describe("app", () => {
  it("exports a configured Express app without binding a port or connecting to a database", () => {
    // Importing src/app.js must be side-effect-free with respect to networking/DB so it
    // can be exercised in isolation (e.g. with a real HTTP request, as below) without a
    // live MongoDB instance. The old src/server.js called app.listen(...) and awaited a
    // real DB connection at module-load time, which made this kind of test impossible.
    assert.equal(typeof app, "function");
    assert.equal(typeof app.listen, "function");
    assert.equal(typeof app.use, "function");
  });

  it("responds to GET /api/health over a real HTTP request", async () => {
    const server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address();

    try {
      const body = await new Promise((resolve, reject) => {
        http
          .get(`http://127.0.0.1:${port}/api/health`, (res) => {
            let data = "";
            res.on("data", (chunk) => (data += chunk));
            res.on("end", () => {
              try {
                resolve({ status: res.statusCode, json: JSON.parse(data) });
              } catch (err) {
                reject(err);
              }
            });
          })
          .on("error", reject);
      });

      assert.equal(body.status, 200);
      assert.equal(body.json.success, true);
      assert.equal(body.json.message, "DriveEase API is running");
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it("returns a 404 AppError JSON body for an unknown route (notFound + errorHandler wired up)", async () => {
    const server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address();

    try {
      const body = await new Promise((resolve, reject) => {
        http
          .get(`http://127.0.0.1:${port}/api/v1/does-not-exist`, (res) => {
            let data = "";
            res.on("data", (chunk) => (data += chunk));
            res.on("end", () => {
              try {
                resolve({ status: res.statusCode, json: JSON.parse(data) });
              } catch (err) {
                reject(err);
              }
            });
          })
          .on("error", reject);
      });

      assert.equal(body.status, 404);
      assert.equal(body.json.success, false);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});
