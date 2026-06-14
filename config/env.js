const requiredEnvVars = ["MONGO_URI", "JWT_SECRET", "FRONTEND_URL", "CRON_SECRET"];

const parseOriginList = (value) => {
  if (!value) {
    return [];
  }

  const trimmed = value.trim();

  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed.map((origin) => String(origin).trim()).filter(Boolean);
      }
    } catch {
      // Fall back to comma-separated parsing.
    }
  }

  return trimmed
    .split(",")
    .map((origin) => origin.trim().replace(/^["']|["']$/g, ""))
    .filter(Boolean);
};

export const getAllowedOrigins = () =>
  [...parseOriginList(process.env.FRONTEND_URL), ...parseOriginList(process.env.ADMIN_PORTAL_URL)];

export const validateEnv = () => {
  const missingVars = requiredEnvVars.filter((key) => !process.env[key]);

  if (missingVars.length > 0) {
    throw new Error(`Missing required environment variables: ${missingVars.join(", ")}`);
  }
};

export const isProduction = () => process.env.NODE_ENV === "production";

export const isCrossSiteFrontend = () => {
  const allowedOrigins = getAllowedOrigins();

  if (allowedOrigins.length === 0) {
    return false;
  }

  try {
    const backendOrigin = process.env.BACKEND_URL ? new URL(process.env.BACKEND_URL).origin : null;

    if (!backendOrigin) {
      return isProduction();
    }

    return allowedOrigins.some((origin) => new URL(origin).origin !== backendOrigin);
  } catch {
    return isProduction();
  }
};
