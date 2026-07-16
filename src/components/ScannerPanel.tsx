import React, { useState, useEffect, useRef } from "react";
import { 
  Camera, 
  AlertTriangle, 
  CheckCircle, 
  LogOut, 
  FileWarning,
  Smartphone,
  ShieldCheck,
  UserCheck,
  X,
  Terminal
} from "lucide-react";
import { Html5Qrcode } from "html5-qrcode";
import { AuthState, Event } from "../types";
import { verifyScan } from "../lib/api";

interface ScannerPanelProps {
  auth: AuthState;
  selectedEvent: Event;
  onBackToEvents: () => void;
  onLogout: () => void;
}

export default function ScannerPanel({ auth, selectedEvent, onBackToEvents, onLogout }: ScannerPanelProps) {
  const [scannerStatus, setScannerStatus] = useState<"idle" | "scanning" | "error">("idle");
  const [cameraError, setCameraError] = useState<string | null>(null);
  
  // Scanned states: idle, valid, duplicate, fake
  const [scanState, setScanState] = useState<"idle" | "valid" | "duplicate" | "fake">("idle");

  const lastScannedTokenRef = useRef<string>("");
  const lastScannedTimestampRef = useRef<number>(0);
  const cooldownTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      if (cooldownTimerRef.current) {
        clearTimeout(cooldownTimerRef.current);
      }
    };
  }, []);
  const [scanResult, setScanResult] = useState<{
    student?: {
      full_name: string;
      email: string;
      college: string;
    };
    message?: string;
    original_time?: string;
    scanned_at?: string;
    scanned_by_name?: string;
  } | null>(null);

  const html5QrcodeRef = useRef<Html5Qrcode | null>(null);
  const scannerId = "camera-viewfinder";

  // Handle active webcam scanner initialization & cleanups
  useEffect(() => {
    startWebcamScanner();

    return () => {
      stopWebcamScanner();
    };
  }, []);

  const startWebcamScanner = async () => {
    setCameraError(null);
    setScannerStatus("scanning");
    try {
      // Ensure existing is stopped
      if (html5QrcodeRef.current) {
        try {
          await html5QrcodeRef.current.stop();
        } catch (e) {}
      }

      const scannerInstance = new Html5Qrcode(scannerId);
      html5QrcodeRef.current = scannerInstance;

      await scannerInstance.start(
        { facingMode: "environment" },
        {
          fps: 10,
          qrbox: (width, height) => {
            const size = Math.min(width, height) * 0.7;
            return { width: size, height: size };
          }
        },
        (decodedText) => {
          // Success callback - keep camera running, process scan with local cooldown block
          const now = Date.now();
          if (decodedText === lastScannedTokenRef.current && (now - lastScannedTimestampRef.current) < 3000) {
            return;
          }
          lastScannedTokenRef.current = decodedText;
          lastScannedTimestampRef.current = now;
          handleVerifyToken(decodedText);
        },
        (errorMessage) => {
          // Keep scanner scanning, silent check
        }
      );
    } catch (err: any) {
      console.error("Webcam startup error:", err);
      setScannerStatus("error");
      setCameraError(
        err.message || 
        "Webcam access is locked or blocked. Make sure your browser has granted camera frame permissions or use the high-fidelity simulator below."
      );
    }
  };

  const stopWebcamScanner = async () => {
    if (html5QrcodeRef.current && html5QrcodeRef.current.isScanning) {
      try {
        await html5QrcodeRef.current.stop();
      } catch (e) {
        console.error("Error stopping camera", e);
      }
    }
    setScannerStatus("idle");
  };

  // Central Cryptographic verification router — calls Supabase RPC directly
  const handleVerifyToken = async (tokenStr: string) => {
    try {
      const scannedBy = auth.user?.id || "unknown";
      const data = await verifyScan(tokenStr, scannedBy, selectedEvent.id);

      if (data.status === "VALID") {
        setScanState("valid");
        setScanResult(data);
      } else if (data.status === "ALREADY_USED") {
        setScanState("duplicate");
        setScanResult(data);
      } else {
        setScanState("fake");
        setScanResult({ message: data.message || "Fake or forged QR signature detected." });
      }

      // Start 30-second auto-clear timer
      if (cooldownTimerRef.current) {
        clearTimeout(cooldownTimerRef.current);
      }
      cooldownTimerRef.current = setTimeout(() => {
        setScanState("idle");
        setScanResult(null);
      }, 30000);
    } catch (e: any) {
      setScanState("fake");
      setScanResult({ message: "Network connection or signature validation failed." });
    }
  };

  // Removed simulator action methods

  const handleResetScanState = () => {
    if (cooldownTimerRef.current) {
      clearTimeout(cooldownTimerRef.current);
    }
    setScanState("idle");
    setScanResult(null);
    lastScannedTokenRef.current = ""; // Reset block so it can be scanned again immediately
  };

  return (
    <div className="w-full max-w-5xl mx-auto px-4 py-8">
      {/* Top Banner with Station Info */}
      <div id="scanner-banner" className="bg-brand-primary p-6 rounded-2xl border border-brand-accent/20 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8 shadow-xl">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-brand-accent/10 border border-brand-accent/40 flex items-center justify-center text-brand-accent">
            <Smartphone className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-serif text-lg font-bold tracking-wide text-brand-text">
                {auth.user?.committee_name || "Active Station"}
              </span>
              <span className="px-2 py-0.5 text-[10px] bg-brand-accent text-brand-primary-dark font-mono font-semibold uppercase rounded-full">
                Scanner Node
              </span>
            </div>
            <p className="text-xs text-brand-text/60 font-mono mt-0.5">
              Operator: <span className="text-brand-text/90 font-semibold">@{auth.user?.username}</span> | System: SecurPass v1.1
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto">
          <button
            onClick={onBackToEvents}
            className="w-full md:w-auto px-4 py-2.5 bg-brand-primary-dark hover:bg-brand-primary-light border border-brand-accent/20 hover:border-brand-accent/60 rounded-xl text-xs font-semibold tracking-wider uppercase transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-md"
          >
            ← Back to Events
          </button>
          <button
            id="scanner-logout-btn"
            onClick={onLogout}
            className="w-full md:w-auto px-4 py-2.5 bg-brand-primary-dark hover:bg-red-950/40 text-brand-text/80 hover:text-red-300 border border-brand-accent/10 hover:border-red-500/30 rounded-xl text-xs font-semibold tracking-wider uppercase transition-all flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            Lock Console
          </button>
        </div>
      </div>

      {/* ==================== ACTIVE SCANNER SCREEN ==================== */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* Viewfinder Column */}
          <div className="lg:col-span-7 space-y-6">

            {/* Camera Viewfinder Module */}
            <div className="bg-brand-primary rounded-3xl border border-brand-accent/20 p-6 shadow-xl relative overflow-hidden">
              <h3 className="font-serif text-xl font-bold tracking-wide text-brand-text mb-4 uppercase flex items-center gap-2">
                <Camera className="w-5 h-5 text-brand-accent" />
                Live Viewfinder
              </h3>

              {cameraError ? (
                <div className="bg-red-950/40 border border-red-500/30 p-6 rounded-2xl text-center space-y-4">
                  <AlertTriangle className="w-12 h-12 text-red-400 mx-auto animate-bounce" />
                  <div>
                    <h4 className="font-semibold text-red-200 text-sm">Camera Stream Inhibited</h4>
                    <p className="text-xs text-brand-text/60 leading-relaxed mt-2 max-w-md mx-auto">
                      {cameraError}
                    </p>
                  </div>
                  <button
                    onClick={startWebcamScanner}
                    className="px-4 py-2 bg-brand-primary-dark hover:bg-brand-primary-dark/80 text-brand-accent text-xs font-semibold tracking-wider uppercase rounded-xl border border-brand-accent/20 cursor-pointer"
                  >
                    Retry Camera Hook
                  </button>
                </div>
              ) : (
                <div className="relative aspect-square w-full max-w-md mx-auto bg-black rounded-2xl overflow-hidden border-2 border-dashed border-brand-accent/30 flex flex-col justify-center items-center">
                  {/* Frame Target Overlays */}
                  <div className="absolute inset-8 border border-white/20 rounded-xl pointer-events-none flex items-center justify-center">
                    <div className="w-48 h-48 border-2 border-brand-accent rounded-lg relative animate-pulse">
                      <div className="absolute top-0 left-0 w-4 h-4 border-t-4 border-l-4 border-brand-accent -translate-x-1 -translate-y-1"></div>
                      <div className="absolute top-0 right-0 w-4 h-4 border-t-4 border-r-4 border-brand-accent translate-x-1 -translate-y-1"></div>
                      <div className="absolute bottom-0 left-0 w-4 h-4 border-b-4 border-l-4 border-brand-accent -translate-x-1 translate-y-1"></div>
                      <div className="absolute bottom-0 right-0 w-4 h-4 border-b-4 border-r-4 border-brand-accent translate-x-1 translate-y-1"></div>
                    </div>
                  </div>

                  <div id={scannerId} className="w-full h-full object-cover"></div>

                  {scannerStatus === "scanning" && (
                    <div className="absolute bottom-4 bg-brand-primary-dark/90 px-4 py-1.5 rounded-full text-[10px] font-mono tracking-widest text-brand-accent border border-brand-accent/20 animate-pulse uppercase">
                      📹 Active Lens scanning...
                    </div>
                  )}
                </div>
              )}

              <div className="mt-4 text-center">
                <p className="text-xs text-brand-text/50">
                  Align student's printed or digital email QR code within the target bracket to instantly record attendance.
                </p>
              </div>

              {/* Scan Result Alert Card for Camera */}
              {scanState !== "idle" && (
                <div className={`mt-6 p-4 rounded-2xl border text-left flex items-start gap-3 shadow-lg animate-fade-in relative ${
                  scanState === "valid" 
                    ? "bg-emerald-950/80 border-emerald-500/30 text-emerald-100" 
                    : scanState === "duplicate"
                    ? "bg-amber-950/80 border-amber-500/30 text-amber-100"
                    : "bg-red-950/80 border-red-500/30 text-red-100"
                }`}>
                  {scanState === "valid" && <CheckCircle className="w-6 h-6 text-emerald-400 shrink-0 mt-0.5" />}
                  {scanState === "duplicate" && <AlertTriangle className="w-6 h-6 text-amber-400 shrink-0 mt-0.5" />}
                  {scanState === "fake" && <FileWarning className="w-6 h-6 text-red-400 shrink-0 mt-0.5" />}
                  <div className="flex-1 space-y-1">
                    <div className="flex justify-between items-start">
                      <h4 className="font-serif text-xs font-bold uppercase tracking-wider">
                        {scanState === "valid" ? "Access Granted" : scanState === "duplicate" ? "Duplicate Entry" : "Access Denied"}
                      </h4>
                      <span className="text-[9px] font-mono opacity-60 bg-white/5 px-1.5 py-0.5 rounded">AUTO-CLEARING</span>
                    </div>
                    {scanState === "fake" ? (
                      <p className="text-xs">{scanResult?.message || "HMAC verification failed."}</p>
                    ) : (
                      <>
                        <p className="text-xs font-semibold text-white">{scanResult?.student?.full_name}</p>
                        <p className="text-[10px] opacity-75 font-mono">
                          College: {scanResult?.student?.college} | {scanState === "valid" ? (scanResult?.time_string || "Just now") : `Scanned at ${scanResult?.original_time} by [${scanResult?.scanned_by_name}]`}
                        </p>
                      </>
                    )}
                  </div>
                  <button onClick={handleResetScanState} className="opacity-60 hover:opacity-100 cursor-pointer ml-1 p-0.5 border-none bg-transparent">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>

            {/* Sandbox Simulator */}
            <div className="bg-brand-primary rounded-3xl border border-brand-accent/20 p-6 shadow-xl space-y-4">
              <h3 className="font-serif text-lg font-bold tracking-wide text-brand-text uppercase flex items-center gap-2">
                <Terminal className="w-5 h-5 text-brand-accent" />
                Ticket Token Simulator
              </h3>
              <p className="text-xs text-brand-text/60 leading-relaxed">
                If the camera stream is inhibited (e.g., over an insecure HTTP network connection), copy a student's QR token from the Admin Dashboard and paste it here to simulate a live door scan.
              </p>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  const form = e.currentTarget;
                  const formData = new FormData(form);
                  const token = formData.get("simulatedToken") as string;
                  if (token.trim()) {
                    await handleVerifyToken(token.trim());
                    form.reset();
                  }
                }}
                className="flex gap-2"
              >
                <input
                  type="text"
                  name="simulatedToken"
                  placeholder="Paste QR token string..."
                  className="flex-1 bg-brand-primary-dark border border-brand-accent/20 rounded-xl px-4 py-2.5 text-xs text-brand-text placeholder-brand-text/30 focus:outline-none focus:border-brand-accent/60"
                  required
                />
                <button
                  type="submit"
                  className="px-4 py-2.5 bg-brand-accent hover:bg-brand-accent/90 text-brand-primary-dark font-serif text-xs font-bold tracking-wide uppercase rounded-xl transition-all cursor-pointer shadow"
                >
                  Scan Token
                </button>
              </form>
            </div>

          </div>

          {/* Secure Gate Checklist Column */}
          <div className="lg:col-span-5 space-y-6">
            
            <div className="bg-brand-primary rounded-3xl border border-brand-accent/20 p-6 shadow-xl space-y-4">
              <h3 className="font-serif text-lg font-bold tracking-wide text-brand-text uppercase border-b border-brand-accent/10 pb-3 flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-brand-accent" />
                Secure Protocol Check
              </h3>

              <ul className="space-y-4 text-xs font-mono text-brand-text/80">
                <li className="flex items-start gap-2.5">
                  <span className="w-4 h-4 rounded bg-brand-accent/10 text-brand-accent flex items-center justify-center shrink-0 mt-0.5 text-[9px] font-bold">1</span>
                  <div>
                    <span className="text-white block font-bold uppercase tracking-wider">Inspect Credentials</span>
                    <p className="text-brand-text/50 mt-0.5 leading-relaxed">Ask the student for their official ID to cross-reference with the name shown on your scanner.</p>
                  </div>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="w-4 h-4 rounded bg-brand-accent/10 text-brand-accent flex items-center justify-center shrink-0 mt-0.5 text-[9px] font-bold">2</span>
                  <div>
                    <span className="text-white block font-bold uppercase tracking-wider">Single-Use QR Policy</span>
                    <p className="text-brand-text/50 mt-0.5 leading-relaxed">Once scanned, the QR code is automatically locked in our ledger and is completely void for any subsequent entries.</p>
                  </div>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="w-4 h-4 rounded bg-brand-accent/10 text-brand-accent flex items-center justify-center shrink-0 mt-0.5 text-[9px] font-bold">3</span>
                  <div>
                    <span className="text-white block font-bold uppercase tracking-wider">Alert Authority on Fakes</span>
                    <p className="text-brand-text/50 mt-0.5 leading-relaxed">If the viewfinder flags a Red ALERT, do not grant entry, confiscate the ticket and report signature corruption.</p>
                  </div>
                </li>
              </ul>
            </div>

            {/* Quick Stats Block for Scanner operators */}
            <div className="bg-brand-primary-dark/80 rounded-3xl border border-brand-accent/10 p-6 space-y-4">
              <div className="flex items-center gap-2 text-brand-accent">
                <UserCheck className="w-5 h-5" />
                <span className="text-xs uppercase font-bold tracking-widest font-mono">Gate Status Console</span>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-brand-primary/40 p-4 rounded-xl border border-brand-accent/5">
                  <span className="text-[10px] text-brand-text/40 block font-mono">STATION ID</span>
                  <span className="text-brand-text font-bold text-sm block mt-1 font-mono">{auth.user?.id}</span>
                </div>
                <div className="bg-brand-primary/40 p-4 rounded-xl border border-brand-accent/5">
                  <span className="text-[10px] text-brand-text/40 block font-mono">GATE NAME</span>
                  <span className="text-brand-accent font-bold text-sm block mt-1 font-mono truncate">{auth.user?.committee_name.split(" ")[0]}</span>
                </div>
              </div>
            </div>

      </div>
    </div>
  </div>
  );
}
