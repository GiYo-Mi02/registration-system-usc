import express from "express";
import rateLimit from "express-rate-limit";
import { supabase } from "./db";
import { ADMIN_USERNAME } from "./config";

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
  max: 100, // Increased for development and testing convenience
  message: {
    success: false,
    message: "Too many login attempts from this IP. Please try again after 15 minutes."
  },
  standardHeaders: true,
  legacyHeaders: false
});

export const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 100,
  message: {
    success: false,
    message: "Too many requests. Please slow down."
  },
  standardHeaders: true,
  legacyHeaders: false
});

// 2. Authentication Middleware
export const authenticateToken = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  let token = "";
  const authHeader = req.headers["authorization"];
  if (authHeader && authHeader.startsWith("Bearer ")) {
    token = authHeader.substring(7);
  } else if (req.query.token) {
    token = req.query.token as string;
  }

  if (!token) {
    return res.status(401).json({ success: false, message: "Authentication token required" });
  }

  try {
    // Look up session in Supabase committee_sessions table
    const { data: session, error } = await supabase
      .from("committee_sessions")
      .select("*")
      .eq("session_token", token)
      .maybeSingle();

    if (error || !session) {
      return res.status(401).json({ success: false, message: "Session expired or invalid" });
    }

    // Check if session is older than 5 minutes for inactivity timeout
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    const lastHeartbeat = new Date(session.last_heartbeat);
    if (lastHeartbeat < fiveMinutesAgo) {
      // Session expired due to inactivity, delete it
      await supabase.from("committee_sessions").delete().eq("session_token", token);
      return res.status(401).json({ success: false, message: "Session expired due to inactivity" });
    }

    // Update last_heartbeat to now
    const currentTimeStr = new Date().toISOString();
    await supabase
      .from("committee_sessions")
      .update({ last_heartbeat: currentTimeStr })
      .eq("session_token", token);

    if (session.committee_user_id === "admin-id") {
      req.user = { id: "admin-id", username: ADMIN_USERNAME, role: "admin" };
      return next();
    }

    // Fetch user details from committee_users
    const { data: user, error: userError } = await supabase
      .from("committee_users")
      .select("*")
      .eq("id", session.committee_user_id)
      .maybeSingle();

    if (userError || !user || !user.active) {
      return res.status(401).json({ success: false, message: "Scanner account is inactive or invalid" });
    }

    req.user = {
      id: user.id,
      username: user.username,
      role: "committee"
    };
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
