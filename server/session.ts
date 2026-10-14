import type { SupabaseClient } from "@supabase/supabase-js";

export type SessionUser = { id: string; username: string; role: "admin" | "committee" };
type SessionResult = { user: SessionUser; status?: never; message?: never }
  | { user?: never; status: number; message: string };

/** Shared by Express and serverless handlers; never trust the browser's role. */
export async function authenticateSession(
  database: SupabaseClient,
  token: string,
  now = Date.now()
): Promise<SessionResult> {
  if (!token) return { status: 401, message: "Authentication token required." };
  const { data: session, error } = await database.from("committee_sessions")
    .select("committee_user_id, last_heartbeat").eq("session_token", token).maybeSingle();
  if (error) return { status: 503, message: "Session service is unavailable." };
  if (!session) return { status: 401, message: "Session expired or invalid." };
  const heartbeat = new Date(session.last_heartbeat).getTime();
  if (!Number.isFinite(heartbeat) || heartbeat < now - 5 * 60 * 1000 || heartbeat > now + 60_000) {
    await database.from("committee_sessions").delete().eq("session_token", token);
    return { status: 401, message: "Session expired due to inactivity." };
  }
  let user: SessionUser;
  if (session.committee_user_id === "admin-id") {
    user = { id: "admin-id", username: process.env.ADMIN_USERNAME || "", role: "admin" };
  } else {
    const { data: account, error: accountError } = await database.from("committee_users")
      .select("id, username, active").eq("id", session.committee_user_id).maybeSingle();
    if (accountError) return { status: 503, message: "Session service is unavailable." };
    if (!account?.active) return { status: 403, message: "Scanner account is inactive or invalid." };
    user = { id: account.id, username: account.username, role: "committee" };
  }
  const { error: updateError } = await database.from("committee_sessions")
    .update({ last_heartbeat: new Date(now).toISOString() }).eq("session_token", token);
  if (updateError) return { status: 503, message: "Session service is unavailable." };
  return { user };
}
