import test from "node:test";
import assert from "node:assert/strict";

import { isAuthorizedCronRequest } from "../controllers/cron.controller.js";

test("isAuthorizedCronRequest validates bearer token against CRON_SECRET", () => {
  process.env.CRON_SECRET = "test-secret";

  assert.equal(
    isAuthorizedCronRequest({ headers: { authorization: "Bearer test-secret" } }),
    true
  );

  assert.equal(
    isAuthorizedCronRequest({ headers: { authorization: "Bearer wrong-secret" } }),
    false
  );
});

test("isAuthorizedCronRequest fails when CRON_SECRET is not configured", () => {
  delete process.env.CRON_SECRET;

  assert.equal(
    isAuthorizedCronRequest({ headers: { authorization: "Bearer anything" } }),
    false
  );
});
