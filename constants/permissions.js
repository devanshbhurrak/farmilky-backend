/**
 * Farmilky Permission Registry
 *
 * Single source of truth for all permission keys, labels, and defaults.
 * Keys follow the pattern: "<resource>.<action>"
 */

export const PERMISSIONS = {
  // Profile
  PROFILE_VIEW:             "profile.view",
  PROFILE_UPDATE:           "profile.update",

  // Manifest
  MANIFEST_VIEW_TODAY:      "manifest.view_today",
  MANIFEST_VIEW_HISTORY:    "manifest.view_history",
  MANIFEST_UPDATE:          "manifest.update",      // mark entries delivered / failed / skipped

  // Delivery board
  DELIVERY_BOARD_VIEW:      "delivery_board.view",

  // Collections (payment from customers)
  COLLECTION_RECORD:        "collection.record",
  COLLECTION_VIEW_HISTORY:  "collection.view_history",

  // Customers (limited delivery context)
  CUSTOMER_VIEW_BASIC:      "customer.view_basic",

  // Area
  AREA_VIEW:                "area.view",
};

/**
 * Human-readable labels and groupings for the admin permissions UI.
 * Order within each group is the display order.
 */
export const PERMISSION_META = {
  "profile.view":               { label: "View own profile",              group: "Profile" },
  "profile.update":             { label: "Update own profile",            group: "Profile" },
  "manifest.view_today":        { label: "View today's manifest",         group: "Manifest" },
  "manifest.view_history":      { label: "View manifest history",         group: "Manifest" },
  "manifest.update":            { label: "Update manifest entries",       group: "Manifest" },
  "delivery_board.view":        { label: "View delivery board",           group: "Deliveries" },
  "collection.record":          { label: "Record payment collections",    group: "Collections" },
  "collection.view_history":    { label: "View collection history",       group: "Collections" },
  "customer.view_basic":        { label: "View customer info (delivery)", group: "Customers" },
  "area.view":                  { label: "View assigned area info",       group: "Areas" },
};

export const ALL_PERMISSIONS = Object.values(PERMISSIONS);

/**
 * Default permission sets per role.
 * Used to seed the DB on first run and as a fallback if no document exists.
 * All three delivery roles share the same defaults but can diverge once managed via UI.
 */
export const DEFAULT_ROLE_PERMISSIONS = {
  agent: [
    "profile.view",
    "profile.update",
    "manifest.view_today",
    "manifest.view_history",
    "manifest.update",
    "delivery_board.view",
    "collection.record",
    "collection.view_history",
    "customer.view_basic",
    "area.view",
  ],
  delivery: [
    "profile.view",
    "profile.update",
    "manifest.view_today",
    "manifest.view_history",
    "manifest.update",
    "delivery_board.view",
    "collection.record",
    "collection.view_history",
    "customer.view_basic",
    "area.view",
  ],
  delivery_partner: [
    "profile.view",
    "profile.update",
    "manifest.view_today",
    "manifest.view_history",
    "manifest.update",
    "delivery_board.view",
    "collection.record",
    "collection.view_history",
    "customer.view_basic",
    "area.view",
  ],
};
