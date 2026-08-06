import DeliveryManifest from "../models/deliveryManifest.model.js";
import Subscription from "../models/subscription.model.js";
import Order from "../models/order.model.js";
import Area from "../models/area.model.js";
import User from "../models/user.model.js";
import { isSubscriptionDueOnDate, getHolidayDateSet } from "./scheduler.js";

const normalizeDate = (d) => {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  return date;
};

const addressToString = (addr) => {
  if (!addr) return "";
  return [addr.street, addr.city, addr.state, addr.pincode].filter(Boolean).join(", ");
};

const sortEntries = (entries) =>
  [...entries].sort((a, b) => {
    if (a.sequence == null && b.sequence == null) {
      return (a.customerName || "").localeCompare(b.customerName || "");
    }
    if (a.sequence == null) return 1;
    if (b.sequence == null) return -1;
    return a.sequence - b.sequence;
  });

const buildSummary = (entries) => {
  const counts = entries.reduce(
    (acc, e) => {
      acc[e.status] = (acc[e.status] || 0) + 1;
      return acc;
    },
    { pending: 0, delivered: 0, failed: 0, skipped: 0 }
  );
  return {
    total: entries.length,
    delivered: counts.delivered,
    failed: counts.failed,
    pending: counts.pending,
  };
};

/**
 * Generate (or refresh) delivery manifests for a given date.
 *
 * Idempotent: existing manifests for an area+date are never duplicated.
 * With `refresh: true`, missing late entries are appended to active manifests
 * (completed manifests are left untouched), so re-running never disturbs an
 * agent's work or admin resequencing (late entries get sequence: null).
 *
 * @param {Date|string} targetDate  date to generate for (defaults to today)
 * @param {{ refresh?: boolean }} [options]
 * @returns {Promise<{
 *   status: "ok" | "holiday" | "no_areas" | "invalid",
 *   manifests: Array,
 *   unassignedCount: number,
 *   created: number,
 *   appended: number,
 *   message: string,
 * }>}
 */
export const generateManifestsForDate = async (targetDate = new Date(), { refresh = false } = {}) => {
  const resultBase = { manifests: [], unassignedCount: 0, created: 0, appended: 0 };

  const normalized = normalizeDate(targetDate || new Date());
  if (Number.isNaN(normalized.getTime())) {
    return { ...resultBase, status: "invalid", message: `Invalid date provided: ${String(targetDate)}` };
  }

  const holidayDates = await getHolidayDateSet();
  if (holidayDates.has(normalized.getTime())) {
    return { ...resultBase, status: "holiday", message: "No deliveries scheduled — this date is a holiday." };
  }

  // Only areas with an assigned agent produce sheets
  const areas = await Area.find({ isActive: true, assignedAgent: { $ne: null } });
  if (areas.length === 0) {
    return { ...resultBase, status: "no_areas", message: "No active areas with assigned agents found." };
  }

  // Build pincode -> area map (last area wins for overlapping pincodes)
  const pincodeAreaMap = {};
  for (const area of areas) {
    for (const pincode of area.pincodes) {
      pincodeAreaMap[pincode] = area;
    }
  }

  // Build customerId -> { sequence, lat, lng } map from customers with assignedArea
  const areaIds = areas.map((a) => a._id);
  const areaCustomers = await User.find(
    { assignedArea: { $in: areaIds }, role: "customer" },
    "assignedArea deliverySequence addresses"
  );
  const customerDeliveryMap = {};
  for (const c of areaCustomers) {
    const defaultAddr = c.addresses?.find((a) => a.isDefault) || c.addresses?.[0];
    customerDeliveryMap[c._id.toString()] = {
      areaId: c.assignedArea?.toString(),
      sequence: c.deliverySequence ?? null,
      lat: defaultAddr?.lat ?? null,
      lng: defaultAddr?.lng ?? null,
    };
  }

  // Active subscriptions due on targetDate, excluding any already delivered that day
  // (e.g. recorded through the legacy delivery board — avoids double-listing)
  const activeSubs = await Subscription.find({ status: "active" })
    .populate("userId", "name phone addresses assignedArea deliverySequence")
    .populate("productId", "name unit price");

  const dueSubs = activeSubs.filter((sub) => {
    if (!isSubscriptionDueOnDate(sub, normalized, holidayDates)) return false;
    const deliveredToday = sub.deliveryHistory?.some((h) => {
      const d = h.deliveryDate || h.date;
      return d && normalizeDate(d).getTime() === normalized.getTime();
    });
    return !deliveredToday;
  });

  // Pending/confirmed orders (not yet delivered) are carried on every sheet
  const dueOrders = await Order.find({ orderStatus: { $in: ["placed", "confirmed"] } })
    .populate("userId", "name phone assignedArea");

  // Group entries by area
  const areaEntries = {};
  for (const area of areas) {
    areaEntries[area._id.toString()] = [];
  }

  // Unassigned bucket (no matching area)
  const unassigned = [];

  for (const sub of dueSubs) {
    const user = sub.userId;
    const addresses = user?.addresses || [];
    const defaultAddr = addresses.find((a) => a.isDefault) || addresses[0];
    const pincode = defaultAddr?.pincode || "";
    const effectiveUnit = sub.variantUnit || sub.productId?.unit || "unit";
    const productName = sub.productId?.name || "Unknown";
    const variantSuffix = sub.variantLabel ? ` (${sub.variantLabel})` : "";
    const delivMeta = user?._id ? customerDeliveryMap[user._id.toString()] : null;
    // Prefer explicit assignedArea, fall back to pincode matching
    const matchedArea =
      user?.assignedArea && areaEntries[user.assignedArea.toString()] !== undefined
        ? areas.find((a) => a._id.toString() === user.assignedArea.toString())
        : pincodeAreaMap[pincode];
    const entry = {
      type: "subscription",
      referenceId: sub._id,
      customerId: user?._id || null,
      customerName: user?.name || "Unknown",
      phone: user?.phone || "",
      address: addressToString(defaultAddr),
      productLabel: `${productName}${variantSuffix} × ${sub.quantityPerDay} ${effectiveUnit}`,
      quantity: sub.quantityPerDay,
      unit: effectiveUnit,
      amount: sub.totalPricePerDay || 0,
      status: "pending",
      sequence: delivMeta?.sequence ?? null,
      lat: delivMeta?.lat ?? null,
      lng: delivMeta?.lng ?? null,
    };
    if (matchedArea) {
      areaEntries[matchedArea._id.toString()].push(entry);
    } else {
      unassigned.push(entry);
    }
  }

  for (const order of dueOrders) {
    const user = order.userId;
    const addr = order.address;
    const pincode = addr?.pincode || "";
    const delivMeta = user?._id ? customerDeliveryMap[user._id.toString()] : null;
    // Prefer explicit assignedArea (same logic as subscriptions), fall back to pincode matching
    const matchedArea =
      user?.assignedArea && areaEntries[user.assignedArea.toString()] !== undefined
        ? areas.find((a) => a._id.toString() === user.assignedArea.toString())
        : pincodeAreaMap[pincode];
    const entry = {
      type: "order",
      referenceId: order._id,
      customerId: user?._id || null,
      customerName: user?.name || "Unknown",
      phone: user?.phone || "",
      address: addressToString(addr),
      productLabel: order.items.map((i) => `${i.name} x${i.quantity}`).join(", "),
      quantity: order.items.reduce((s, i) => s + i.quantity, 0),
      unit: "items",
      amount: order.totalAmount,
      status: "pending",
      sequence: delivMeta?.sequence ?? null,
      lat: delivMeta?.lat ?? null,
      lng: delivMeta?.lng ?? null,
    };
    if (matchedArea) {
      areaEntries[matchedArea._id.toString()].push(entry);
    } else {
      unassigned.push(entry);
    }
  }

  const manifests = [];
  let createdCount = 0;
  let appendedCount = 0;

  for (const area of areas) {
    const entries = sortEntries(areaEntries[area._id.toString()]);
    if (entries.length === 0) continue;

    // Idempotency: a manifest already exists for this area+date
    const existing = await DeliveryManifest.findOne({ date: normalized, areaId: area._id });

    if (existing) {
      // Refresh appends late entries, but never to completed sheets
      if (refresh && existing.status !== "completed") {
        const missing = entries.filter(
          (e) =>
            !existing.entries.some(
              (oe) => oe.type === e.type && oe.referenceId.toString() === e.referenceId.toString()
            )
        );
        if (missing.length > 0) {
          // Late entries go to the end (sequence null) so admin resequencing is preserved
          existing.entries.push(...missing.map((e) => ({ ...e, sequence: null })));
          existing.summary = buildSummary(existing.entries);
          await existing.save();
          appendedCount += missing.length;
        }
      }
      manifests.push(existing);
      continue;
    }

    let manifest;
    try {
      manifest = await DeliveryManifest.create({
        date: normalized,
        agentId: area.assignedAgent,
        areaId: area._id,
        entries,
        summary: buildSummary(entries),
        status: "active",
      });
      createdCount += 1;
    } catch (error) {
      // Concurrent generation (unique date+areaId index) — reuse the winning document
      if (error?.code === 11000) {
        const raced = await DeliveryManifest.findOne({ date: normalized, areaId: area._id });
        if (raced) {
          manifests.push(raced);
          continue;
        }
      }
      throw error;
    }
    manifests.push(manifest);
  }

  let message = `Generated ${manifests.length} manifest(s) for ${normalized.toDateString()}.`;
  if (appendedCount > 0) {
    message += ` Appended ${appendedCount} late entr${appendedCount === 1 ? "y" : "ies"}.`;
  }
  if (unassigned.length > 0) {
    message += ` ${unassigned.length} deliver${unassigned.length === 1 ? "y" : "ies"} unassigned to any area.`;
  }

  return {
    status: "ok",
    manifests,
    unassignedCount: unassigned.length,
    created: createdCount,
    appended: appendedCount,
    message,
  };
};

/**
 * Cron/startup job: ensure today's sheets exist and stay fresh with late entries.
 */
export const runDailyManifestGenerationJob = async () => {
  console.log("Running daily manifest generation job...");
  const result = await generateManifestsForDate(new Date(), { refresh: true });
  console.log(`[Manifest] ${result.message}`);
  return result;
};
