import { describe, it, before, after, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import "express-async-errors"; // same as app.js: lets async controllers reject into errorHandler
import express from "express";
import nodemailer from "nodemailer";
import { escapeHtml } from "../src/utils/html.utils.js";
import { contactLimiter } from "../src/middleware/rateLimit.middleware.js";
import { errorHandler } from "../src/middleware/errorHandler.js";
import contactRoutes from "../src/routes/contact.routes.js";

const submission = { name: "Alice", email: "alice@example.com", subject: "Question", message: "Hello there" };

describe("escapeHtml", () => {
  it("escapes the characters that can open a tag or break out of an attribute", () => {
    assert.equal(escapeHtml(`<a href="x" onclick='y'>&</a>`), "&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;&amp;&lt;/a&gt;");
  });

  it("escapes ampersands first, so existing entities can't be smuggled through", () => {
    assert.equal(escapeHtml("&lt;script&gt;"), "&amp;lt;script&amp;gt;");
  });

  it("leaves ordinary text alone and coerces non-strings", () => {
    assert.equal(escapeHtml("Plain text, 100% fine."), "Plain text, 100% fine.");
    assert.equal(escapeHtml(42), "42");
  });
});

describe("POST /contact", () => {
  let server;
  let base;
  let sent;
  const savedEnv = { ...process.env };

  before(async () => {
    process.env.SMTP_FROM = "owner@example.com";
    const app = express();
    app.use(express.json());
    app.use("/contact", contactRoutes);
    app.use(errorHandler);
    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    base = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    process.env = savedEnv;
    await new Promise((resolve) => server.close(resolve));
  });

  afterEach(() => {
    mock.restoreAll();
    // The limiter is a module singleton with an in-memory store: clear the loopback client so
    // tests stay independent.
    for (const key of ["127.0.0.1", "::ffff:127.0.0.1", "::1"]) contactLimiter.resetKey(key);
  });

  // Replaces the SMTP transport so nothing is sent; records what would have been.
  const captureMail = () => {
    sent = [];
    mock.method(nodemailer, "createTransport", () => ({ sendMail: async (mail) => sent.push(mail) }));
  };

  const post = async (body) => {
    const res = await fetch(`${base}/contact`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return { status: res.status, json: await res.json() };
  };

  describe("email body", () => {
    const hostile = {
      name: `<img src=x onerror=alert(1)>`,
      email: `a"><script>alert(1)</script>@example.com`,
      subject: `<b>Hi</b>`,
      message: `Click <a href="https://evil.example/login">here</a> & verify\n<script>steal()</script>`,
    };

    it("escapes every visitor-supplied field in the HTML part", async () => {
      captureMail();

      const res = await post(hostile);

      assert.equal(res.status, 200);
      const { html } = sent[0];
      assert.equal(html.includes("<img"), false);
      assert.equal(html.includes("<script"), false);
      assert.equal(html.includes("<a href"), false);
      assert.equal(html.includes("<b>Hi</b>"), false);
      assert.ok(html.includes("&lt;img src=x onerror=alert(1)&gt;"));
      assert.ok(html.includes("&lt;a href=&quot;https://evil.example/login&quot;&gt;here&lt;/a&gt; &amp; verify"));
    });

    it("keeps the plain-text part and the subject line as the visitor wrote them", async () => {
      captureMail();

      await post(hostile);

      const { text, subject } = sent[0];
      assert.ok(text.includes(`Name: ${hostile.name}`));
      assert.ok(text.includes(hostile.message));
      assert.equal(subject, `[Contact Form] ${hostile.subject}`);
    });

    it("still delivers an ordinary message to the configured address", async () => {
      captureMail();

      const res = await post(submission);

      assert.equal(res.status, 200);
      assert.equal(sent.length, 1);
      assert.equal(sent[0].to, "owner@example.com");
      assert.ok(sent[0].html.includes("<strong>Name:</strong> Alice</p>"));
    });
  });

  describe("rate limit", () => {
    it("allows 5 submissions per window and then answers 429", async () => {
      captureMail();

      for (let i = 0; i < 5; i++) assert.equal((await post(submission)).status, 200, `request ${i + 1}`);
      const blocked = await post(submission);

      assert.equal(blocked.status, 429);
      assert.deepEqual(blocked.json, { success: false, message: "Too many attempts. Please try again later." });
      assert.equal(sent.length, 5, "the blocked request must not send an email");
    });

    it("counts rejected submissions too, so malformed spam can't dodge the limit", async () => {
      captureMail();

      for (let i = 0; i < 5; i++) assert.equal((await post({})).status, 400);

      assert.equal((await post(submission)).status, 429);
      assert.equal(sent.length, 0);
    });
  });
});
