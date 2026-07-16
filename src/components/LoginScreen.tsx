import React, { useState } from "react";
import { Shield, Key, Eye, EyeOff, Loader2, UserCheck, Smartphone } from "lucide-react";
import { AuthState } from "../types";

interface LoginScreenProps {
  onLoginSuccess: (auth: AuthState) => void;
}

export default function LoginScreen({ onLoginSuccess }: LoginScreenProps) {
  const [role, setRole] = useState<"admin" | "committee">("admin");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) {
      setError("Please fill in all fields.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password, role }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Invalid credentials.");
      }

      onLoginSuccess({
        isAuthenticated: true,
        token: data.token,
        user: data.user,
        role: data.role,
      });
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  };

  // Removed quick login helper

  return (
    <div id="login-container" className="min-h-screen flex flex-col justify-center items-center px-4 py-12 md:py-24 bg-brand-primary-dark">
      <div className="w-full max-w-md bg-brand-primary-light p-8 rounded-2xl border border-brand-text/10 shadow-2xl relative overflow-hidden">
        
        {/* Visual Header / Brand Accent line */}
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-brand-accent"></div>
 
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-brand-primary-dark border border-brand-accent/30 text-brand-accent mb-4 shadow-inner">
            <Shield className="w-8 h-8" />
          </div>
          <h1 className="font-serif text-3xl font-bold tracking-tight text-brand-text mb-1 uppercase" style={{ fontFamily: "Georgia, serif" }}>
            Apex Institution
          </h1>
          <p className="text-[10px] text-brand-accent font-semibold tracking-[0.2em] uppercase font-mono">
            SECURE ACCESS PORTAL
          </p>
        </div>

        {/* Tab Role Switcher */}
        <div className="flex bg-brand-primary-dark p-1 rounded-lg mb-6 border border-brand-accent/10">
          <button
            id="role-admin-btn"
            type="button"
            className={`flex-1 py-2.5 text-xs font-semibold tracking-wider uppercase rounded-md transition-all duration-300 ${
              role === "admin"
                ? "bg-brand-primary text-brand-accent shadow-md border border-brand-accent/20"
                : "text-brand-text/60 hover:text-brand-text"
            }`}
            onClick={() => {
              setRole("admin");
              setUsername("");
              setPassword("");
              setError(null);
            }}
          >
            <UserCheck className="w-4 h-4 inline-block mr-1.5" />
            Administrator
          </button>
          <button
            id="role-committee-btn"
            type="button"
            className={`flex-1 py-2.5 text-xs font-semibold tracking-wider uppercase rounded-md transition-all duration-300 ${
              role === "committee"
                ? "bg-brand-primary text-brand-accent shadow-md border border-brand-accent/20"
                : "text-brand-text/60 hover:text-brand-text"
            }`}
            onClick={() => {
              setRole("committee");
              setUsername("");
              setPassword("");
              setError(null);
            }}
          >
            <Smartphone className="w-4 h-4 inline-block mr-1.5" />
            Committee Scanner
          </button>
        </div>

        {error && (
          <div id="login-error" className="mb-6 p-4 rounded-lg bg-red-950/40 border border-red-500/30 text-red-200 text-xs leading-relaxed animate-fade-in">
            <strong>Authentication Failed:</strong> {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-xs font-semibold tracking-wider uppercase text-brand-text/80 mb-2 font-mono">
              Username
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-brand-text/40">
                <Shield className="w-4 h-4" />
              </span>
              <input
                id="username-input"
                type="text"
                className="w-full pl-10 pr-4 py-3 bg-brand-primary-dark/60 border border-brand-accent/10 rounded-xl text-sm text-brand-text placeholder-brand-text/30 focus:outline-none focus:border-brand-accent focus:ring-1 focus:ring-brand-accent/50 transition-all"
                placeholder={role === "admin" ? "e.g., admin" : "e.g., scanner1"}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold tracking-wider uppercase text-brand-text/80 mb-2 font-mono">
              Password
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-brand-text/40">
                <Key className="w-4 h-4" />
              </span>
              <input
                id="password-input"
                type={showPassword ? "text" : "password"}
                className="w-full pl-10 pr-10 py-3 bg-brand-primary-dark/60 border border-brand-accent/10 rounded-xl text-sm text-brand-text placeholder-brand-text/30 focus:outline-none focus:border-brand-accent focus:ring-1 focus:ring-brand-accent/50 transition-all"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="button"
                className="absolute inset-y-0 right-0 flex items-center pr-3 text-brand-text/40 hover:text-brand-accent transition-colors"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <button
            id="login-submit-btn"
            type="submit"
            disabled={loading}
            className="w-full py-3.5 bg-brand-accent text-brand-primary-dark font-semibold tracking-wider uppercase rounded-xl hover:bg-brand-accent/90 focus:outline-none focus:ring-2 focus:ring-brand-accent/50 active:scale-[0.98] transition-all disabled:opacity-50 disabled:pointer-events-none mt-2 flex justify-center items-center cursor-pointer shadow-lg"
          >
            {loading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin mr-2" />
                Authenticating...
              </>
            ) : (
              "Sign In Access"
            )}
          </button>
        </form>

        {/* Quick Developer Credentials Panel removed */}

      </div>
    </div>
  );
}
