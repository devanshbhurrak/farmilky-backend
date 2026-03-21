const requiredEnvVars = ["MONGO_URI", "JWT_SECRET", "FRONTEND_URL"];

export const getAllowedOrigins = () =>
  [process.env.FRONTEND_URL, process.env.ADMIN_PORTAL_URL].filter(Boolean);

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
