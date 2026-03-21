import test from "node:test";
import assert from "node:assert/strict";

import orderRoutes from "../routes/order.routes.js";

test("admin order routes are registered before dynamic user id routes", () => {
  const routeLayers = orderRoutes.stack
    .filter((layer) => layer.route)
    .map((layer) => ({
      path: layer.route.path,
      methods: Object.keys(layer.route.methods),
    }));

  assert.deepEqual(routeLayers[0], {
    path: "/admin/all",
    methods: ["get"],
  });

  assert.deepEqual(routeLayers[1], {
    path: "/admin/:id/status",
    methods: ["put"],
  });
});
