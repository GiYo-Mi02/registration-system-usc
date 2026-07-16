import "dotenv/config";

export const PORT = parseInt(process.env.PORT || "3000", 10);
export const QR_SECRET = process.env.QR_SECRET || "default_dev_secret_key_change_me_in_production";
export const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "admin";
export const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";

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
