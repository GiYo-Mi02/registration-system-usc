export interface Student {
  id: string;
  full_name: string;
  email: string;
  college: string;
  form_response_id: string;
  imported_at: string;
  email_status: "sent" | "failed";
  email_error?: string;
  scanned_at?: string | null;
  scanned_by?: string | null;
  scanned_by_name?: string | null;
}

export interface User {
  id: string;
  username: string;
  committee_name: string;
}

export interface AuthState {
  isAuthenticated: boolean;
  token: string | null;
  user: User | null;
  role: "admin" | "committee" | null;
}

export interface Stats {
  total: number;
  attended: number;
  attendanceRate: number;
  emailsSent: number;
  emailsFailed: number;
  emailSuccessRate: number;
}

export interface Event {
  id: string;
  name: string;
  event_date: string;
  description: string;
  venue: string;
  banner_url: string;
  created_at?: string;
}
