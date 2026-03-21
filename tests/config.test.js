import test from "node:test";
import assert from "node:assert/strict";

import { validateEnv } from "../config/env.js";
import { getAuthCookieOptions } from "../utils/cookieOptions.js";

test("validateEnv throws when required environment variables are missing", () => {
  const originalEnv = {
    MONGO_URI: process.env.MONGO_URI,
    JWT_SECRET: process.env.JWT_SECRET,
    FRONTEND_URL: process.env.FRONTEND_URL,
  };

  delete process.env.MONGO_URI;
  delete process.env.JWT_SECRET;
  delete process.env.FRONTEND_URL;

  assert.throws(
    () => validateEnv(),
    /Missing required environment variables: MONGO_URI, JWT_SECRET, FRONTEND_URL/
  );

  Object.assign(process.env, originalEnv);
});

test("getAuthCookieOptions uses lax cookies for same-site local development", () => {
  process.env.NODE_ENV = "development";
  process.env.FRONTEND_URL = "http://localhost:5173";
  delete process.env.BACKEND_URL;

  const options = getAuthCookieOptions();

  assert.equal(options.httpOnly, true);
  assert.equal(options.secure, false);
  assert.equal(options.sameSite, "lax");
});

test("getAuthCookieOptions uses none cookies for cross-site production deployments", () => {
  process.env.NODE_ENV = "production";
  process.env.FRONTEND_URL = "https://farmilky-frontend.example.com";
  process.env.BACKEND_URL = "https://farmilky-api.example.com";

  const options = getAuthCookieOptions();

  assert.equal(options.secure, true);
  assert.equal(options.sameSite, "none");
});
