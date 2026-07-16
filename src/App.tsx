import React, { useState, useEffect } from "react";
import { AuthState, Student, Event } from "./types";
import LoginScreen from "./components/LoginScreen";
import EventsMenu from "./components/EventsMenu";
import AdminPanel from "./components/AdminPanel";
import ScannerPanel from "./components/ScannerPanel";
import { ShieldCheck, RefreshCw, AlertTriangle } from "lucide-react";
import { supabase } from "./lib/supabase";
import { logoutUser, sendHeartbeat } from "./lib/auth";
import { fetchStudents } from "./lib/api";

export default function App() {
  const [auth, setAuth] = useState<AuthState>({
    isAuthenticated: false,
    token: null,
    user: null,
    role: null,
  });

  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [loadingRegistry, setLoadingRegistry] = useState(false);
  const [activeSessionCount, setActiveSessionCount] = useState(0);
  const [sseStatus, setSseStatus] = useState<"connecting" | "connected" | "disconnected">("connecting");

  // Fetch full student list scoped by selected event
  const loadStudents = async (tokenOverride?: string, eventIdOverride?: string) => {
    const tokenToUse = tokenOverride || auth.token;
    const eventIdToUse = eventIdOverride || selectedEvent?.id;
    if (!tokenToUse || !eventIdToUse) return;
    setLoadingRegistry(true);
    try {
      const students = await fetchStudents(tokenToUse, eventIdToUse);
      setStudents(students);
    } catch (e) {
      console.error("Failed to fetch students:", e);
    } finally {
      setLoadingRegistry(false);
    }
  };

  // Check existing session on load
  useEffect(() => {
    const cachedAuth = sessionStorage.getItem("securpass_auth");
    const cachedEvent = sessionStorage.getItem("securpass_event");
    if (cachedAuth) {
      try {
        const parsedAuth = JSON.parse(cachedAuth);
        setAuth(parsedAuth);
        if (cachedEvent) {
          const parsedEvent = JSON.parse(cachedEvent);
          setSelectedEvent(parsedEvent);
          loadStudents(parsedAuth.token, parsedEvent.id);
        }
      } catch (e) {
        sessionStorage.removeItem("securpass_auth");
        sessionStorage.removeItem("securpass_event");
      }
    }
  }, []);

  // 1. Establish Supabase Realtime connection for real-time reactivity
  useEffect(() => {
    if (!auth.isAuthenticated || !auth.token) {
      setSseStatus("disconnected");
      return;
    }

    setSseStatus("connecting");

    const channel = supabase
      .channel("realtime-updates")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "students" }, () => {
        loadStudents();
        setSseStatus("connected");
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "students" }, (payload) => {
        setStudents((prev) => prev.filter((s) => s.id !== payload.old.id));
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "students" }, () => {
        loadStudents();
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "attendance" }, () => {
        loadStudents();
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "attendance" }, () => {
        loadStudents();
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") setSseStatus("connected");
        if (status === "CLOSED" || status === "CHANNEL_ERROR") setSseStatus("disconnected");
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [auth.isAuthenticated, auth.token, selectedEvent]);

  // 2. Heartbeat monitoring via Supabase direct update
  useEffect(() => {
    if (!auth.isAuthenticated || !auth.token) return;

    const heartbeatInterval = setInterval(async () => {
      const alive = await sendHeartbeat(auth.token!);
      if (!alive) {
        handleLogout();
        const roleMsg = auth.role === "admin" ? "administrator" : "scanner";
        alert(`Your ${roleMsg} session has timed out or been superseded by another operator. Please sign in again.`);
      }
    }, 15000);

    return () => clearInterval(heartbeatInterval);
  }, [auth]);

  const handleLoginSuccess = (newAuth: AuthState) => {
    setAuth(newAuth);
    sessionStorage.setItem("securpass_auth", JSON.stringify(newAuth));
  };

  const handleSelectEvent = (event: Event) => {
    setSelectedEvent(event);
    sessionStorage.setItem("securpass_event", JSON.stringify(event));
    loadStudents(auth.token ?? undefined, event.id);
  };

  const handleBackToEvents = () => {
    setSelectedEvent(null);
    sessionStorage.removeItem("securpass_event");
    setStudents([]);
  };

  const handleLogout = async () => {
    if (auth.token) {
      await logoutUser(auth.token);
    }

    const clearedAuth: AuthState = {
      isAuthenticated: false,
      token: null,
      user: null,
      role: null,
    };
    setAuth(clearedAuth);
    setSelectedEvent(null);
    sessionStorage.removeItem("securpass_auth");
    sessionStorage.removeItem("securpass_event");
    setStudents([]);
  };

  const totalCount = students.length;
  const attendedCount = students.filter(s => s.scanned_at !== null && s.scanned_at !== undefined).length;
  const attendanceRate = totalCount > 0 ? ((attendedCount / totalCount) * 100).toFixed(1) : "0.0";

  return (
    <div id="app-root-container" className="min-h-screen bg-brand-primary-dark text-brand-text flex flex-col justify-between" style={{ fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif" }}>
      
      {/* Top Main Navigation Bar */}
      {auth.isAuthenticated && selectedEvent && (
        <header id="app-navbar" className="bg-brand-primary/95 border-b border-brand-text/10 py-5 px-8 sticky top-0 z-40 backdrop-blur-md shadow-lg animate-fade-in">
          <div className="w-full max-w-7xl mx-auto flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            
            <div className="flex items-center gap-3">
              <span className="p-2 bg-brand-accent/10 border border-brand-accent/30 text-brand-accent rounded-xl shadow-inner">
                <ShieldCheck className="w-6 h-6 animate-pulse" />
              </span>
              <div className="flex flex-col">
                <h1 className="text-xl md:text-2xl tracking-tight font-serif font-bold text-brand-text leading-tight" style={{ fontFamily: "Georgia, serif" }}>
                  {selectedEvent.name}
                </h1>
                <span className="text-[10px] uppercase tracking-[0.2em] text-brand-accent font-semibold">
                  {auth.role === "admin" ? "Admin Controller • Live Monitoring" : auth.role === "committee" ? "Gate Scanner Node • Live Pipeline" : "Secure Access Control • Gateway"}
                </span>
              </div>
            </div>

            {/* Connection Status badges and controls */}
            <div className="flex flex-wrap items-center gap-6 self-stretch sm:self-auto justify-between sm:justify-end">
              
              {/* Attendance Rate dynamic HUD */}
              <div className="flex items-center gap-4 text-right">
                <div>
                  <p className="text-[10px] uppercase opacity-60 tracking-wider font-mono">Attendance Rate</p>
                  <p className="text-lg font-bold font-serif text-brand-accent">
                    {attendanceRate}% <span className="text-xs text-brand-text/60 font-normal"> ({attendedCount}/{totalCount})</span>
                  </p>
                </div>
                <div className="w-10 h-10 rounded-full border-2 border-brand-accent flex items-center justify-center p-0.5">
                  <div className="w-full h-full rounded-full bg-brand-accent/25 flex items-center justify-center text-brand-accent text-[9px] font-mono font-bold uppercase tracking-tighter animate-pulse">
                    Live
                  </div>
                </div>
              </div>

              <div className="h-8 w-[1px] bg-brand-text/20 hidden md:block"></div>

              <div className="flex items-center gap-3">
                {/* Realtime Stream Indicators */}
                <div className="flex items-center gap-2 bg-brand-primary-dark/80 px-3 py-1.5 rounded-full border border-brand-text/10 font-mono text-[10px] shadow-inner font-bold">
                  <span className={`w-2.5 h-2.5 rounded-full ${
                    sseStatus === "connected" 
                      ? "bg-emerald-500 animate-pulse" 
                      : sseStatus === "connecting"
                      ? "bg-amber-400 animate-spin"
                      : "bg-red-500"
                  }`}></span>
                  <span className="text-brand-text/80 uppercase tracking-wider">
                    {sseStatus === "connected" ? "Live Sync" : sseStatus === "connecting" ? "Syncing..." : "Offline"}
                  </span>
                </div>

                {/* Role indication if logged in */}
                {auth.isAuthenticated && (
                  <div className="hidden sm:flex items-center gap-2 bg-brand-accent/15 text-brand-accent px-3 py-1.5 rounded-full border border-brand-accent/20 font-mono text-[10px] font-bold uppercase tracking-wider">
                    {auth.role === "admin" ? "🛡️ Admin" : "📹 Scanner"}
                  </div>
                )}
              </div>

            </div>

          </div>
        </header>
      )}

      {/* Primary Application Screens Routing */}
      <main className="flex-grow flex flex-col">
        {!auth.isAuthenticated ? (
          <LoginScreen onLoginSuccess={handleLoginSuccess} />
        ) : !selectedEvent ? (
          <EventsMenu 
            auth={auth} 
            onSelectEvent={handleSelectEvent} 
            onLogout={handleLogout} 
          />
        ) : auth.role === "admin" ? (
          <AdminPanel 
            auth={auth} 
            selectedEvent={selectedEvent}
            onBackToEvents={handleBackToEvents}
            onLogout={handleLogout} 
            students={students} 
            onRefreshStudents={loadStudents} 
          />
        ) : auth.role === "committee" ? (
          <ScannerPanel 
            auth={auth} 
            selectedEvent={selectedEvent}
            onBackToEvents={handleBackToEvents}
            onLogout={handleLogout} 
          />
        ) : (
          <div className="text-center p-12 space-y-4">
            <AlertTriangle className="w-12 h-12 text-red-400 mx-auto" />
            <p className="text-sm">Invalid authentication state. Please clear session cache and restart.</p>
            <button onClick={handleLogout} className="px-4 py-2 bg-brand-accent text-brand-primary-dark font-bold rounded">Logout</button>
          </div>
        )}
      </main>

      {/* Global Brand Footer */}
      <footer id="app-footer" className="bg-brand-primary-dark border-t border-brand-accent/5 py-4 text-center">
        <p className="text-[10px] text-brand-text/30 font-mono uppercase tracking-wider">
          Apex Secure QR Access Gateway &bull; Designed for rapid check-in validation &bull; Confidential &copy; 2026
        </p>
      </footer>

    </div>
  );
}
