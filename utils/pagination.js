/**
 * Shared pagination + search + sorting helpers for list endpoints.
 * Keeps behaviour consistent across controllers and computes totalPages.
 */

export function parsePagination(query = {}, options = {}) {
  const {
    defaultLimit = 20,
    maxLimit = 100,
    defaultSort = { createdAt: -1 },
    allowedSortFields = null, // null = allow any field
  } = options;

  let page = parseInt(query.page, 10);
  let limit = parseInt(query.limit, 10);
  if (!Number.isFinite(page) || page < 1) page = 1;
  if (!Number.isFinite(limit) || limit < 1) limit = defaultLimit;
  limit = Math.min(limit, maxLimit);
  const skip = (page - 1) * limit;

  let sort = defaultSort;
  if (query.sortBy) {
    const field = String(query.sortBy).trim();
    const order = String(query.sortOrder || query.order || "desc").toLowerCase();
    const dir = order === "asc" ? 1 : -1;
    if (!allowedSortFields || allowedSortFields.includes(field)) {
      sort = { [field]: dir };
    }
  }

  return { page, limit, skip, sort };
}

export function buildPaginationMeta(total, page, limit) {
  return {
    total,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
}

export function escapeRegex(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function buildSearchOr(escapedSearch, fields) {
  const regex = { $regex: escapedSearch, $options: "i" };
  return fields.map((f) => ({ [f]: regex }));
}
