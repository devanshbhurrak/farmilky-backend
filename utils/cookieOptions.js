import { isCrossSiteFrontend, isProduction } from "../config/env.js";

export const getAuthCookieOptions = () => ({
  httpOnly: true,
  secure: isProduction(),
  sameSite: isCrossSiteFrontend() ? "none" : "lax",
  maxAge: 7 * 24 * 60 * 60 * 1000,
  path: "/",
});

export const getClearCookieOptions = () => ({
  httpOnly: true,
  secure: isProduction(),
  sameSite: isCrossSiteFrontend() ? "none" : "lax",
  path: "/",
});
