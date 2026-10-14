import express from "express";
import rateLimit from "express-rate-limit";
import { supabase } from "./db";
import { authenticateSession } from "./session";

export interface AuthenticatedUser {
  id: string;
  username: string;
  role: "admin" | "committee";
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

// 1. Rate Limiters
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: {
    status: 429,
    success: false,
    message: "Too many login attempts from this IP. Please try again after 15 minutes."
  }
});

export const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 100,
  message: {
    status: 429,
    success: false,
    message: "Too many requests. Please slow down."
  }
});

// 2. Authentication Middleware
export const authenticateToken = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  let token = "";
  const authHeader = req.headers["authorization"];
  if (authHeader && authHeader.startsWith("Bearer ")) {
    token = authHeader.substring(7);
  } else if (req.path === "/api/live-updates" && typeof req.query.token === "string") {
    token = req.query.token as string;
  }

  if (!token) {
    return res.status(401).json({ success: false, message: "Authentication token required" });
  }

  try {
    const result = await authenticateSession(supabase, token);
    if (!result.user) return res.status(result.status).json({ success: false, message: result.message });
    req.user = result.user;
    next();
  } catch (err) {
    console.error("Authentication middleware error:", err);
    return res.status(500).json({ success: false, message: "Internal server authentication error" });
  }
};

// 3. Role Checking Helpers
export const requireAdmin = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (req.user?.role !== "admin") {
    return res.status(403).json({ success: false, message: "Access denied: Administrator role required" });
  }
  next();
};

export const requireCommitteeOrAdmin = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (req.user?.role !== "admin" && req.user?.role !== "committee") {
    return res.status(403).json({ success: false, message: "Access denied: Scanner or Administrator role required" });
  }
  next();
};
