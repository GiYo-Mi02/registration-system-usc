import { supabase } from "./supabase";
import { AuthState } from "../types";
import crypto from "crypto";

// ─── LOGIN ─────────────────────────────────────────────────────────────────
// Calls Supabase RPC `login_user` which does bcrypt comparison server-side.
// The RPC creates a session token and returns user info — no secrets leave the DB.
export async function loginUser(
  username: string,
  password: string,
  role: "admin" | "committee"
): Promise<{ success: boolean; auth?: AuthState; message?: string }> {
  try {
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password, role }),
    });

    const data = await res.json();

    if (!res.ok || !data.success) {
      return { success: false, message: data.message || "Authentication failed." };
    }

    return {
      success: true,
      auth: {
        isAuthenticated: true,
        token: data.token,
        user: data.user,
        role: data.role,
      },
    };
  } catch (err: any) {
    console.error("[Auth] Login error:", err);
    return { success: false, message: "Network connection error. Processor offline." };
  }
}

// ─── LOGOUT ────────────────────────────────────────────────────────────────
export async function logoutUser(token: string): Promise<void> {
  try {
    await supabase
      .from("committee_sessions")
      .delete()
      .eq("session_token", token);
  } catch (e) {
    console.error("[Auth] Logout error:", e);
  }
}

// ─── HEARTBEAT ─────────────────────────────────────────────────────────────
// Updates last_heartbeat in committee_sessions so session stays alive.
// Returns false if session no longer exists (expired or revoked).
export async function sendHeartbeat(token: string): Promise<boolean> {
  try {
    const res = await fetch("/api/heartbeat", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`
      }
    });
    if (!res.ok) return false;
    const data = await res.json();
    return data.success;
  } catch (e) {
    console.error("[Auth] Heartbeat error:", e);
    return false;
  }
}

// ─── VALIDATE SESSION ──────────────────────────────────────────────────────
export async function validateSession(token: string): Promise<boolean> {
  try {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { data } = await supabase
      .from("committee_sessions")
      .select("id, last_heartbeat")
      .eq("session_token", token)
      .gt("last_heartbeat", fiveMinutesAgo)
      .maybeSingle();
    return !!data;
  } catch (e) {
    return false;
  }
}
