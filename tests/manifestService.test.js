import test from "node:test";
import assert from "node:assert/strict";
import { mock } from "node:test";
import { pathToFileURL } from "node:url";
import path from "node:path";

const root = process.cwd();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makeQuery = (docs) => {
  const q = {
    populate: () => q,
    sort: () => q,
    select: () => q,
    limit: () => q,
    skip: () => q,
    then: (resolve) => resolve(docs),
    catch: () => q,
  };
  return q;
};

const todayMidnight = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

const makeArea = (id, pincodes = [], agentId = "agent-1") => ({
  _id: id,
  name: `Area ${id}`,
  isActive: true,
  pincodes,
  assignedAgent: agentId,
});

const makeUser = (id, { addresses = [], assignedArea = null, deliverySequence = null } = {}) => ({
  _id: id,
  name: `Customer ${id}`,
  phone: `9${id}`,
  addresses,
  assignedArea,
  deliverySequence,
});

const makeSub = (id, userId, { deliveryHistory = [], quantityPerDay = 2, variantUnit = "L", totalPricePerDay = 100 } = {}) => ({
  _id: id,
  userId: makeUser(userId, { assignedArea: "area-1", deliverySequence: 3 }),
  productId: { _id: "p1", name: "Milk", unit: "L", price: 50 },
  quantityPerDay,
  variantUnit,
  variantLabel: "Full Cream",
  totalPricePerDay,
  deliveryHistory,
});

const makeOrder = (id, userId, { assignedArea = "area-1", pincode = "400001", items = [{ name: "Paneer", quantity: 1 }] } = {}) => ({
  _id: id,
  userId: makeUser(userId, { assignedArea }),
  address: { street: "1 Main Rd", city: "Mumbai", state: "MH", pincode },
  items,
  totalAmount: 250,
  orderStatus: "placed",
});

const makeManifest = (overrides = {}) => ({
  _id: "m1",
  date: todayMidnight(),
  agentId: "agent-1",
  areaId: "area-1",
  status: "active",
  entries: [],
  summary: { total: 0, delivered: 0, failed: 0, pending: 0 },
  async save() {
    this.saved = true;
  },
  ...overrides,
});

// ---------------------------------------------------------------------------
// Mock modules BEFORE importing the service
// ---------------------------------------------------------------------------

let areaDocs = [];
let userDocs = [];
let subDocs = [];
let orderDocs = [];
let manifestDocs = [];
let holidaySet = new Set();
let createError = null;

const DeliveryManifestMock = {
  findOne: async (query) =>
    manifestDocs.find(
      (m) => m.areaId === query.areaId && m.date.getTime() === query.date.getTime()
    ) || null,
  create: async (doc) => {
    if (createError) throw createError;
    const manifest = { ...doc, _id: `m${manifestDocs.length + 1}`, entries: [...doc.entries], saved: false };
    manifestDocs.push(manifest);
    return manifest;
  },
};

const AreaMock = { find: (query) => makeQuery(areaDocs) };
const UserMock = { find: (query, projection) => makeQuery(userDocs) };
const SubscriptionMock = { find: (query) => makeQuery(subDocs) };
const OrderMock = { find: (query) => makeQuery(orderDocs) };

const SchedulerMock = {
  getHolidayDateSet: async () => holidaySet,
  isSubscriptionDueOnDate: () => true,
};

for (const [relPath, mod] of [
  ["services/scheduler.js", { namedExports: SchedulerMock }],
  ["models/deliveryManifest.model.js", { defaultExport: DeliveryManifestMock }],
  ["models/area.model.js", { defaultExport: AreaMock }],
  ["models/user.model.js", { defaultExport: UserMock }],
  ["models/subscription.model.js", { defaultExport: SubscriptionMock }],
  ["models/order.model.js", { defaultExport: OrderMock }],
]) {
  mock.module(pathToFileURL(path.join(root, relPath)), mod);
}

const { generateManifestsForDate } = await import(
  pathToFileURL(path.join(root, "services/manifestService.js"))
);

const resetState = () => {
  areaDocs = [];
  userDocs = [];
  subDocs = [];
  orderDocs = [];
  manifestDocs = [];
  holidaySet = new Set();
  createError = null;
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test("returns holiday status and creates nothing on a holiday", async () => {
  resetState();
  holidaySet = new Set([todayMidnight().getTime()]);
  areaDocs = [makeArea("area-1", ["400001"])];
  subDocs = [makeSub("s1", "u1")];

  const result = await generateManifestsForDate(new Date());

  assert.equal(result.status, "holiday");
  assert.deepEqual(result.manifests, []);
  assert.equal(result.created, 0);
});

test("returns no_areas when no area has an assigned agent", async () => {
  resetState();
  areaDocs = [];
  subDocs = [makeSub("s1", "u1")];

  const result = await generateManifestsForDate(new Date());

  assert.equal(result.status, "no_areas");
  assert.equal(result.message, "No active areas with assigned agents found.");
});

test("creates one manifest per area with sorted entries and summary", async () => {
  resetState();
  userDocs = [
    makeUser("u1", { assignedArea: "area-1", deliverySequence: 2, addresses: [{ street: "A", isDefault: true }] }),
    makeUser("u2", { assignedArea: "area-1", deliverySequence: 1, addresses: [{ street: "B", isDefault: true }] }),
  ];
  areaDocs = [makeArea("area-1", ["400001"])];
  subDocs = [
    { ...makeSub("s1", "u1"), userId: userDocs[0] },
    { ...makeSub("s2", "u2"), userId: userDocs[1] },
  ];

  const result = await generateManifestsForDate(new Date());

  assert.equal(result.status, "ok");
  assert.equal(result.manifests.length, 1);
  const manifest = result.manifests[0];
  assert.equal(manifest.agentId, "agent-1");
  assert.equal(manifest.status, "active");
  assert.equal(manifest.summary.total, 2);
  assert.equal(manifest.summary.pending, 2);
  // sorted by deliverySequence: u2 (1) before u1 (2)
  assert.deepEqual(manifest.entries.map((e) => e.referenceId), ["s2", "s1"]);
  assert.equal(result.created, 1);
  assert.equal(result.unassignedCount, 0);
});

test("is idempotent — re-running for the same date does not duplicate", async () => {
  resetState();
  areaDocs = [makeArea("area-1", ["400001"])];
  subDocs = [makeSub("s1", "u1")];

  const first = await generateManifestsForDate(new Date());
  const second = await generateManifestsForDate(new Date());

  assert.equal(first.created, 1);
  assert.equal(second.created, 0);
  assert.equal(manifestDocs.length, 1);
  assert.equal(second.manifests.length, 1);
});

test("refresh appends late entries to an active manifest, preserving existing order", async () => {
  resetState();
  areaDocs = [makeArea("area-1", ["400001"])];
  manifestDocs = [
    makeManifest({
      entries: [
        { _id: "e1", type: "subscription", referenceId: "s1", status: "pending", sequence: 5 },
      ],
      summary: { total: 1, delivered: 0, failed: 0, pending: 1 },
    }),
  ];
  subDocs = [makeSub("s1", "u1"), makeSub("s2", "u2")];

  const result = await generateManifestsForDate(new Date(), { refresh: true });

  assert.equal(result.status, "ok");
  assert.equal(result.appended, 1);
  const manifest = result.manifests[0];
  assert.equal(manifest.entries.length, 2);
  assert.equal(manifest.entries[0].referenceId, "s1");
  assert.equal(manifest.entries[0].sequence, 5);
  assert.equal(manifest.entries[1].referenceId, "s2");
  assert.equal(manifest.entries[1].sequence, null);
  assert.equal(manifest.summary.total, 2);
  assert.equal(manifest.saved, true);
});

test("refresh never appends to a completed manifest", async () => {
  resetState();
  areaDocs = [makeArea("area-1", ["400001"])];
  manifestDocs = [
    makeManifest({
      status: "completed",
      entries: [{ _id: "e1", type: "subscription", referenceId: "s1", status: "delivered", sequence: 1 }],
    }),
  ];
  subDocs = [makeSub("s1", "u1"), makeSub("s2", "u2")];

  const result = await generateManifestsForDate(new Date(), { refresh: true });

  assert.equal(result.appended, 0);
  assert.equal(result.manifests[0].entries.length, 1);
  assert.equal(result.manifests[0].saved, undefined);
});

test("refresh without flag leaves existing manifests untouched", async () => {
  resetState();
  areaDocs = [makeArea("area-1", ["400001"])];
  manifestDocs = [
    makeManifest({
      entries: [{ _id: "e1", type: "subscription", referenceId: "s1", status: "pending", sequence: 1 }],
    }),
  ];
  subDocs = [makeSub("s1", "u1"), makeSub("s2", "u2")];

  const result = await generateManifestsForDate(new Date(), { refresh: false });

  assert.equal(result.appended, 0);
  assert.equal(result.manifests[0].entries.length, 1);
});

test("excludes subscriptions already delivered today (deliveryHistory)", async () => {
  resetState();
  areaDocs = [makeArea("area-1", ["400001"])];
  subDocs = [
    makeSub("s1", "u1", { deliveryHistory: [{ deliveryDate: todayMidnight(), status: "delivered" }] }),
  ];

  const result = await generateManifestsForDate(new Date());

  assert.equal(result.status, "ok");
  assert.equal(result.created, 0);
  assert.equal(result.manifests.length, 0);
});

test("routes unassigned deliveries to the unassigned bucket", async () => {
  resetState();
  areaDocs = [makeArea("area-1", ["400001"])];
  // pincode 999999 does not match any area and no explicit assignedArea
  subDocs = [makeSub("s1", "u1")];
  subDocs[0].userId = makeUser("u1", { assignedArea: null, addresses: [{ street: "X", isDefault: true, pincode: "999999" }] });

  const result = await generateManifestsForDate(new Date());

  assert.equal(result.status, "ok");
  assert.equal(result.unassignedCount, 1);
  assert.equal(result.created, 0);
});

test("includes pending orders in the manifest", async () => {
  resetState();
  areaDocs = [makeArea("area-1", ["400001"])];
  subDocs = [];
  orderDocs = [makeOrder("o1", "u1")];

  const result = await generateManifestsForDate(new Date());

  assert.equal(result.status, "ok");
  assert.equal(result.manifests.length, 1);
  const entry = result.manifests[0].entries[0];
  assert.equal(entry.type, "order");
  assert.equal(entry.referenceId, "o1");
  assert.equal(entry.unit, "items");
});

test("handles concurrent duplicate generation (E11000) gracefully", async () => {
  resetState();
  areaDocs = [makeArea("area-1", ["400001"])];
  subDocs = [makeSub("s1", "u1")];
  createError = Object.assign(new Error("dup"), { code: 11000 });
  const existing = makeManifest({
    entries: [{ _id: "e1", type: "subscription", referenceId: "s1", status: "pending", sequence: 1 }],
  });
  manifestDocs = [existing];

  const result = await generateManifestsForDate(new Date());

  assert.equal(result.status, "ok");
  assert.equal(result.created, 0);
  assert.equal(result.manifests.length, 1);
  assert.equal(result.manifests[0]._id, existing._id);
});

test("returns invalid status for an unparseable date", async () => {
  resetState();
  areaDocs = [makeArea("area-1", ["400001"])];
  subDocs = [makeSub("s1", "u1")];

  const result = await generateManifestsForDate("not-a-date");

  assert.equal(result.status, "invalid");
  assert.deepEqual(result.manifests, []);
  assert.equal(result.created, 0);
});

test("empty-string date falls back to today (no crash)", async () => {
  resetState();
  areaDocs = [makeArea("area-1", ["400001"])];
  subDocs = [makeSub("s1", "u1")];

  const result = await generateManifestsForDate("");

  assert.equal(result.status, "ok");
  assert.equal(result.created, 1);
});

test("creates one manifest per area, none for empty areas", async () => {
  resetState();
  areaDocs = [makeArea("area-1", ["400001"]), makeArea("area-2", ["400002"])];
  userDocs = [
    makeUser("u1", { assignedArea: "area-1", deliverySequence: 1 }),
    makeUser("u2", { assignedArea: "area-2", deliverySequence: 1 }),
  ];
  subDocs = [
    { ...makeSub("s1", "u1"), userId: userDocs[0] },
    { ...makeSub("s2", "u2"), userId: userDocs[1] },
  ];

  const result = await generateManifestsForDate(new Date());

  assert.equal(result.status, "ok");
  assert.equal(result.manifests.length, 2);
  const areas = result.manifests.map((m) => m.areaId).sort();
  assert.deepEqual(areas, ["area-1", "area-2"]);
  assert.equal(result.created, 2);
});

test("matches area by pincode when the customer has no assignedArea", async () => {
  resetState();
  areaDocs = [makeArea("area-1", ["400001"])];
  subDocs = [
    {
      ...makeSub("s1", "u1"),
      userId: makeUser("u1", {
        assignedArea: null,
        addresses: [{ street: "X", city: "Mumbai", state: "MH", pincode: "400001", isDefault: true }],
      }),
    },
  ];

  const result = await generateManifestsForDate(new Date());

  assert.equal(result.status, "ok");
  assert.equal(result.manifests.length, 1);
  assert.equal(result.manifests[0].areaId, "area-1");
  assert.equal(result.unassignedCount, 0);
});
