import test from "node:test";
import assert from "node:assert/strict";

import { adminOnly } from "../middleware/adminMiddleware.js";

test("adminOnly allows admin users", () => {
  let nextCalled = false;
  const req = { user: { role: "admin" } };
  const res = {
    status() {
      throw new Error("status should not be called for admin users");
    },
  };

  adminOnly(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
});

test("adminOnly rejects non-admin users", () => {
  let statusCode;
  let payload;
  const req = { user: { role: "customer" } };
  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(body) {
      payload = body;
      return body;
    },
  };

  adminOnly(req, res, () => {
    throw new Error("next should not be called for non-admin users");
  });

  assert.equal(statusCode, 403);
  assert.deepEqual(payload, { message: "Access denied. Admin only." });
});
