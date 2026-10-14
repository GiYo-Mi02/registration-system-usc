import "dotenv/config";

export const PORT = parseInt(process.env.PORT || "3000", 10);
export const QR_SECRET = process.env.QR_SECRET || "";
export const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "";
export const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";

export function validateServerConfiguration() {
  const required = { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, QR_SECRET, ADMIN_USERNAME, ADMIN_PASSWORD };
  const missing = Object.entries(required).filter(([, value]) => !value).map(([name]) => name);
  if (missing.length) throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) throw new Error("PORT must be between 1 and 65535.");
  if (process.env.NODE_ENV === "production" && (QR_SECRET.length < 32 || ADMIN_PASSWORD.length < 12 || ADMIN_PASSWORD === "admin123")) {
    throw new Error("Production requires a QR_SECRET of at least 32 characters and an ADMIN_PASSWORD of at least 12 characters.");
  }
}

export const SUPABASE_URL = process.env.SUPABASE_URL || "";
export const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

export const SMTP_HOST = process.env.SMTP_HOST || "";
export const SMTP_PORT = parseInt(process.env.SMTP_PORT || "587", 10);
export const SMTP_USER = process.env.SMTP_USER || "";
export const SMTP_PASS = process.env.SMTP_PASS || "";
export const SMTP_FROM = process.env.SMTP_FROM || "";

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.warn("WARNING: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not defined in environment variables. Database connections will fail.");
}
