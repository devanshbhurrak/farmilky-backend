const requiredEnvVars = ["MONGO_URI", "JWT_SECRET", "FRONTEND_URL"];

export const validateEnv = () => {
  const missingVars = requiredEnvVars.filter((key) => !process.env[key]);

  if (missingVars.length > 0) {
    throw new Error(`Missing required environment variables: ${missingVars.join(", ")}`);
  }
};

export const isProduction = () => process.env.NODE_ENV === "production";

export const isCrossSiteFrontend = () => {
  const frontendUrl = process.env.FRONTEND_URL;

  if (!frontendUrl) {
    return false;
  }

  try {
    const frontendOrigin = new URL(frontendUrl).origin;
    const backendOrigin = process.env.BACKEND_URL ? new URL(process.env.BACKEND_URL).origin : null;

    if (!backendOrigin) {
      return isProduction();
    }

    return frontendOrigin !== backendOrigin;
  } catch {
    return isProduction();
  }
};
