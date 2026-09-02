import React, { useState, useEffect, useRef, useCallback } from "react";
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
  Terminal,
  CameraOff,
  RefreshCw,
  SwitchCamera,
  ImagePlus
} from "lucide-react";
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";
import { AuthState, Event } from "../types";
import { verifyScan } from "../lib/api";

interface ScannerPanelProps {
  auth: AuthState;
  selectedEvent: Event;
  onBackToEvents: () => void;
  onLogout: () => void;
}

interface CameraDevice {
  id: string;
  label: string;
}

export default function ScannerPanel({ auth, selectedEvent, onBackToEvents, onLogout }: ScannerPanelProps) {
  const [scannerStatus, setScannerStatus] = useState<"idle" | "scanning" | "error">("idle");
  const [cameraError, setCameraError] = useState<string | null>(null);
  
  // Scanned states: idle, valid, duplicate, fake
  const [scanState, setScanState] = useState<"idle" | "valid" | "duplicate" | "fake">("idle");

  const [cameras, setCameras] = useState<CameraDevice[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>("");
  const [activeFacingMode, setActiveFacingMode] = useState<"environment" | "user">("environment");

  const lastScannedTokenRef = useRef<string>("");
  const lastScannedTimestampRef = useRef<number>(0);
  const cooldownTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isValidatingRef = useRef<boolean>(false);
  const scanStateRef = useRef<"idle" | "valid" | "duplicate" | "fake">("idle");

  const updateScanState = (state: "idle" | "valid" | "duplicate" | "fake") => {
    setScanState(state);
    scanStateRef.current = state;
  };

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
      program?: string | null;
      section?: string | null;
    };
    message?: string;
    original_time?: string;
    scanned_at?: string;
    scanned_by_name?: string;
  } | null>(null);

  const html5QrcodeRef = useRef<Html5Qrcode | null>(null);
  const cameraOperationRef = useRef(false);
  const scannerId = "camera-viewfinder";
  const resultRef = useRef<HTMLDivElement | null>(null);

  // Smooth scroll into view when a scan succeeds/fails and shows the result card
  useEffect(() => {
    if (scanState !== "idle" && resultRef.current) {
      resultRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [scanState]);

  const refreshCameras = useCallback(async (preferredDeviceId?: string) => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    try {
      const devices = (await navigator.mediaDevices.enumerateDevices())
        .filter(device => device.kind === "videoinput" && device.deviceId)
        .map((device, index) => ({
          id: device.deviceId,
          label: device.label || `Camera ${index + 1}`
        }));
      setCameras(devices);
      setSelectedCameraId(current => {
        if (current && devices.some(device => device.id === current)) return current;
        if (preferredDeviceId && devices.some(device => device.id === preferredDeviceId)) return preferredDeviceId;
        return devices[0]?.id || "";
      });
    } catch (error) {
      console.warn("Unable to refresh camera list:", error);
    }
  }, []);

  const stopWebcamScanner = async (updateStatus = true) => {
    const scanner = html5QrcodeRef.current;
    html5QrcodeRef.current = null;
    if (scanner) {
      try {
        if (scanner.isScanning) await scanner.stop();
      } catch (error) {
        console.warn("Error stopping camera:", error);
      }
      try {
        scanner.clear();
      } catch {
        // The viewfinder may already have been cleared by a failed start.
      }
    }
    if (updateStatus) setScannerStatus("idle");
  };

  const cameraErrorMessage = (error: unknown) => {
    const raw = String((error as { message?: unknown })?.message || error || "");
    const normalized = raw.toLowerCase();
    if (!window.isSecureContext) {
      return "Camera access requires HTTPS. Open the production HTTPS address directly in Safari.";
    }
    if (normalized.includes("notallowed") || normalized.includes("permission") || normalized.includes("denied")) {
      return "Camera permission is blocked. On iPhone, open Settings → Safari → Camera, choose Allow, return here, and tap Start Rear Camera again.";
    }
    if (normalized.includes("notfound") || normalized.includes("requested device not found")) {
      return "No usable camera was found. Confirm the device has a camera and try Switch Camera or QR Image.";
    }
    if (normalized.includes("notreadable") || normalized.includes("trackstart") || normalized.includes("could not start")) {
      return "The camera is busy. Close Camera, FaceTime, or other scanner tabs, then retry.";
    }
    return raw || "The camera could not start. Retry with the rear camera, switch cameras, or scan a QR image.";
  };

  const startWebcamScanner = async (requestedTarget: string | "environment" | "user" = "environment") => {
    if (cameraOperationRef.current) return;
    cameraOperationRef.current = true;
    setCameraError(null);
    setScannerStatus("scanning");

    try {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        throw new Error("Secure camera APIs are unavailable in this browser.");
      }

      await stopWebcamScanner(false);
      const isDeviceId = requestedTarget !== "environment" && requestedTarget !== "user";
      const targets: Array<string | MediaTrackConstraints> = isDeviceId
        ? [requestedTarget]
        : [
            { facingMode: { exact: requestedTarget } },
            { facingMode: { ideal: requestedTarget } },
            { facingMode: requestedTarget },
            ...(requestedTarget === "environment" ? [{ facingMode: "user" as const }] : [])
          ];

      let scannerInstance: Html5Qrcode | null = null;
      let lastError: unknown = null;

      for (const target of targets) {
        const candidate = new Html5Qrcode(scannerId, {
          verbose: false,
          formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
          useBarCodeDetectorIfSupported: true
        });
        try {
          await candidate.start(
            target,
            {
              fps: 10,
              disableFlip: false,
              qrbox: (width, height) => {
                const size = Math.floor(Math.min(width, height) * 0.72);
                return { width: size, height: size };
              }
            },
            (decodedText) => {
              if (isValidatingRef.current || scanStateRef.current !== "idle") return;
              const now = Date.now();
              if (decodedText === lastScannedTokenRef.current && now - lastScannedTimestampRef.current < 3000) return;
              lastScannedTokenRef.current = decodedText;
              lastScannedTimestampRef.current = now;
              void handleVerifyToken(decodedText);
            },
            () => {
              // Failed frames are normal while the viewfinder is searching.
            }
          );
          scannerInstance = candidate;
          break;
        } catch (error) {
          lastError = error;
          try {
            if (candidate.isScanning) await candidate.stop();
            candidate.clear();
          } catch {
            // Continue through the iOS-compatible fallback targets.
          }
        }
      }

      if (!scannerInstance) throw lastError || new Error("No compatible camera configuration succeeded.");
      html5QrcodeRef.current = scannerInstance;

      const video = document.querySelector<HTMLVideoElement>(`#${scannerId} video`);
      if (video) {
        video.muted = true;
        video.setAttribute("muted", "true");
        video.setAttribute("playsinline", "true");
        video.setAttribute("webkit-playsinline", "true");
      }

      const settings = scannerInstance.getRunningTrackSettings();
      const facingMode = settings.facingMode === "user" ? "user" : "environment";
      setActiveFacingMode(facingMode);
      await refreshCameras(settings.deviceId);
      setScannerStatus("scanning");
    } catch (error) {
      console.error("Webcam startup error:", error);
      await stopWebcamScanner(false);
      setScannerStatus("error");
      setCameraError(cameraErrorMessage(error));
    } finally {
      cameraOperationRef.current = false;
    }
  };

  const handleCameraChange = async (cameraId: string) => {
    setSelectedCameraId(cameraId);
    await startWebcamScanner(cameraId);
  };

  const handleSwitchCamera = async () => {
    await startWebcamScanner(activeFacingMode === "environment" ? "user" : "environment");
  };

  useEffect(() => {
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setScannerStatus("error");
      setCameraError("Camera access requires Safari or another modern browser over HTTPS.");
    }

    const handleDeviceChange = () => void refreshCameras();
    navigator.mediaDevices?.addEventListener?.("devicechange", handleDeviceChange);
    return () => {
      navigator.mediaDevices?.removeEventListener?.("devicechange", handleDeviceChange);
      void stopWebcamScanner(false);
    };
  }, [refreshCameras]);

  // The server validates the committee session and QR signature before check-in.
  const handleVerifyToken = async (tokenStr: string) => {
    if (isValidatingRef.current || scanStateRef.current !== "idle") {
      return;
    }
    isValidatingRef.current = true;

    try {
      if (!auth.token) throw new Error("Scanner session is missing. Please sign in again.");
      const data = await verifyScan(tokenStr, selectedEvent.id, auth.token);

      if (data.status === "VALID") {
        updateScanState("valid");
        setScanResult(data);
        // Auto-clear success scans after 2 seconds to make continuous scans extremely quick and smooth
        if (cooldownTimerRef.current) {
          clearTimeout(cooldownTimerRef.current);
        }
        cooldownTimerRef.current = setTimeout(() => {
          handleResetScanState();
        }, 2000);
      } else if (data.status === "ALREADY_USED") {
        updateScanState("duplicate");
        setScanResult(data);
        // Auto-clear duplicate status card after 4 seconds
        if (cooldownTimerRef.current) {
          clearTimeout(cooldownTimerRef.current);
        }
        cooldownTimerRef.current = setTimeout(() => {
          handleResetScanState();
        }, 4000);
      } else {
        updateScanState("fake");
        setScanResult({ message: data.message || "Fake or forged QR signature detected." });
        // Auto-clear invalid status card after 4 seconds
        if (cooldownTimerRef.current) {
          clearTimeout(cooldownTimerRef.current);
        }
        cooldownTimerRef.current = setTimeout(() => {
          handleResetScanState();
        }, 4000);
      }
    } catch (e: any) {
      updateScanState("fake");
      setScanResult({ message: e?.message || "Network connection or signature validation failed." });
      if (cooldownTimerRef.current) {
        clearTimeout(cooldownTimerRef.current);
      }
      cooldownTimerRef.current = setTimeout(() => {
        handleResetScanState();
      }, 4000);
    } finally {
      isValidatingRef.current = false;
    }
  };

  const handleQrImage = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || cameraOperationRef.current) return;

    cameraOperationRef.current = true;
    setCameraError(null);
    try {
      await stopWebcamScanner(false);
      const fileScanner = new Html5Qrcode(scannerId, {
        verbose: false,
        formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
        useBarCodeDetectorIfSupported: true
      });
      html5QrcodeRef.current = fileScanner;
      const decodedText = await fileScanner.scanFile(file, false);
      fileScanner.clear();
      html5QrcodeRef.current = null;
      setScannerStatus("idle");
      await handleVerifyToken(decodedText);
    } catch (error) {
      console.error("QR image scan failed:", error);
      updateScanState("fake");
      setScanResult({ message: "No readable registration QR code was found in that image." });
      if (cooldownTimerRef.current) clearTimeout(cooldownTimerRef.current);
      cooldownTimerRef.current = setTimeout(handleResetScanState, 4000);
      await stopWebcamScanner(false);
      setScannerStatus("idle");
    } finally {
      cameraOperationRef.current = false;
      event.target.value = "";
    }
  };

  // Removed simulator action methods

  const handleResetScanState = () => {
    if (cooldownTimerRef.current) {
      clearTimeout(cooldownTimerRef.current);
    }
    updateScanState("idle");
    setScanResult(null);
    lastScannedTokenRef.current = ""; // Reset block so it can be scanned again immediately
    isValidatingRef.current = false;
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
              Operator: <span className="text-brand-text/90 font-semibold">@{auth.user?.username}</span> | System: SecurPass v1.2
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

              <div className="mb-4 grid grid-cols-2 sm:grid-cols-4 gap-2">
                <button
                  type="button"
                  onClick={() => void startWebcamScanner("environment")}
                  className="col-span-2 sm:col-span-1 px-3 py-2.5 bg-brand-accent hover:bg-brand-accent/90 text-brand-primary-dark rounded-xl text-[11px] font-bold tracking-wide uppercase transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <RefreshCw className="w-4 h-4" />
                  {scannerStatus === "scanning" ? "Restart Rear" : "Start Rear Camera"}
                </button>
                <button
                  type="button"
                  onClick={() => void handleSwitchCamera()}
                  className="px-3 py-2.5 bg-brand-primary-dark hover:bg-brand-primary-light border border-brand-accent/20 text-brand-text rounded-xl text-[11px] font-semibold tracking-wide uppercase transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <SwitchCamera className="w-4 h-4" />
                  Switch
                </button>
                <button
                  type="button"
                  onClick={() => void stopWebcamScanner()}
                  disabled={scannerStatus !== "scanning"}
                  className="px-3 py-2.5 bg-brand-primary-dark hover:bg-red-950/40 disabled:opacity-40 disabled:cursor-not-allowed border border-brand-accent/20 text-brand-text rounded-xl text-[11px] font-semibold tracking-wide uppercase transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <CameraOff className="w-4 h-4" />
                  Stop
                </button>
                <label className="px-3 py-2.5 bg-brand-primary-dark hover:bg-brand-primary-light border border-brand-accent/20 text-brand-text rounded-xl text-[11px] font-semibold tracking-wide uppercase transition-all flex items-center justify-center gap-1.5 cursor-pointer">
                  <ImagePlus className="w-4 h-4" />
                  QR Image
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleQrImage}
                    className="sr-only"
                    aria-label="Scan a QR code from an image"
                  />
                </label>
              </div>

              <p className="mb-4 text-[11px] text-brand-text/55 leading-relaxed">
                On iPhone, tap <span className="text-brand-accent font-semibold">Start Rear Camera</span> first, then allow camera access. If Safari picked the front lens, tap Switch. QR Image is available as a fallback.
              </p>

              {cameras.length > 1 && (
                <div className="mb-4 flex flex-col sm:flex-row items-start sm:items-center gap-2 bg-brand-primary-dark/50 p-3 rounded-2xl border border-brand-accent/10">
                  <label htmlFor="camera-select" className="text-xs font-mono text-brand-text/60 uppercase shrink-0">
                    Camera Source:
                  </label>
                  <select
                    id="camera-select"
                    value={selectedCameraId}
                    onChange={(e) => void handleCameraChange(e.target.value)}
                    className="w-full bg-brand-primary-dark border border-brand-accent/20 rounded-xl px-3 py-2 text-xs text-brand-text focus:outline-none focus:border-brand-accent/60 transition-all cursor-pointer"
                  >
                    {cameras.map((camera) => (
                      <option key={camera.id} value={camera.id}>
                        {camera.label || `Camera ${camera.id}`}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {cameraError && (
                <div className="mb-4 bg-red-950/40 border border-red-500/30 p-6 rounded-2xl text-center space-y-4">
                  <AlertTriangle className="w-12 h-12 text-red-400 mx-auto animate-bounce" />
                  <div>
                    <h4 className="font-semibold text-red-200 text-sm">Camera Stream Inhibited</h4>
                    <p className="text-xs text-brand-text/60 leading-relaxed mt-2 max-w-md mx-auto">
                      {cameraError}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void startWebcamScanner("environment")}
                    className="px-4 py-2 bg-brand-primary-dark hover:bg-brand-primary-dark/80 text-brand-accent text-xs font-semibold tracking-wider uppercase rounded-xl border border-brand-accent/20 cursor-pointer"
                  >
                    Retry Rear Camera
                  </button>
                </div>
              )}

              <div className={`relative aspect-square w-full max-w-xl mx-auto bg-black rounded-3xl overflow-hidden border-4 border-dashed transition-all duration-300 flex flex-col justify-center items-center ${
                  scanState === "valid"
                    ? "border-emerald-500 ring-8 ring-emerald-500/20"
                    : scanState === "duplicate"
                    ? "border-amber-500 ring-8 ring-amber-500/20"
                    : scanState === "fake"
                    ? "border-red-500 ring-8 ring-red-500/20"
                    : "border-brand-accent/30"
                }`}>
                  {/* Status Flash Overlay */}
                  {scanState !== "idle" && (
                    <div className={`absolute inset-0 pointer-events-none animate-flash-overlay z-10 opacity-0 ${
                      scanState === "valid"
                        ? "bg-emerald-500/25"
                        : scanState === "duplicate"
                        ? "bg-amber-500/25"
                        : "bg-red-500/25"
                    }`}></div>
                  )}

                  {/* Frame Target Overlays */}
                  <div className="absolute inset-4 sm:inset-6 border border-white/10 rounded-2xl pointer-events-none flex items-center justify-center z-10">
                    <div className="w-[80%] h-[80%] max-w-[320px] max-h-[320px] aspect-square border-2 border-brand-accent/30 rounded-2xl relative animate-pulse flex items-center justify-center">
                      <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-brand-accent -translate-x-1 -translate-y-1 rounded-tl-md"></div>
                      <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-brand-accent translate-x-1 -translate-y-1 rounded-tr-md"></div>
                      <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-brand-accent -translate-x-1 translate-y-1 rounded-bl-md"></div>
                      <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-brand-accent translate-x-1 translate-y-1 rounded-br-md"></div>
                    </div>
                  </div>

                  <div id={scannerId} className="w-full h-full object-cover"></div>

                  {scannerStatus !== "scanning" && (
                    <button
                      type="button"
                      onClick={() => void startWebcamScanner("environment")}
                      className="absolute z-20 px-5 py-3 bg-brand-accent hover:bg-brand-accent/90 text-brand-primary-dark font-bold text-xs tracking-wide uppercase rounded-xl shadow-xl cursor-pointer flex items-center gap-2"
                    >
                      <Camera className="w-4 h-4" />
                      Tap to Start Rear Camera
                    </button>
                  )}

                  {scannerStatus === "scanning" && (
                    <div className="absolute bottom-4 bg-brand-primary-dark/95 px-5 py-2 rounded-full text-[10px] sm:text-xs font-mono tracking-widest text-brand-accent border border-brand-accent/20 animate-pulse uppercase z-10">
                      {activeFacingMode === "environment" ? "Rear" : "Front"} lens scanning...
                    </div>
                  )}
                </div>

              <div className="mt-4 text-center">
                <p className="text-xs text-brand-text/50">
                  Align student's printed or digital email QR code within the target bracket to instantly record attendance.
                </p>
              </div>

              {/* Scan Result Alert Card for Camera */}
              {scanState !== "idle" && (
                <div 
                  ref={resultRef}
                  className={`mt-6 p-5 sm:p-6 rounded-3xl border text-left flex items-center gap-4 md:gap-5 shadow-2xl animate-fade-in relative transition-all duration-300 ${
                    scanState === "valid" 
                      ? "bg-emerald-900/90 border-emerald-500/40 text-emerald-100 ring-2 ring-emerald-500/20" 
                      : scanState === "duplicate"
                      ? "bg-amber-900/90 border-amber-500/40 text-amber-100 ring-2 ring-amber-500/20"
                      : "bg-red-900/90 border-red-500/40 text-red-100 ring-2 ring-red-500/20"
                  }`}
                >
                  <div className="shrink-0 p-2.5 rounded-2xl bg-white/5 border border-white/10">
                    {scanState === "valid" && <CheckCircle className="w-10 h-10 md:w-12 md:h-12 text-emerald-400" />}
                    {scanState === "duplicate" && <AlertTriangle className="w-10 h-10 md:w-12 md:h-12 text-amber-400" />}
                    {scanState === "fake" && <FileWarning className="w-10 h-10 md:w-12 md:h-12 text-red-400" />}
                  </div>

                  <div className="flex-1 space-y-1.5 min-w-0">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h4 className="font-serif text-sm md:text-base font-bold uppercase tracking-wider">
                        {scanState === "valid" ? "Access Granted" : scanState === "duplicate" ? "Duplicate Entry" : "Access Denied"}
                      </h4>
                      <span className="text-[10px] md:text-xs font-mono font-bold tracking-wide opacity-85 bg-black/30 border border-white/10 px-2 py-0.5 rounded">
                        AUTO-CLEAR
                      </span>
                    </div>

                    {scanState === "fake" ? (
                      <p className="text-sm font-semibold break-words leading-relaxed text-white">{scanResult?.message || "HMAC verification failed."}</p>
                    ) : (
                      <div className="space-y-0.5">
                        <p className="text-base md:text-lg font-extrabold text-white truncate tracking-wide">{scanResult?.student?.full_name}</p>
                        <p className="text-xs md:text-sm opacity-90 font-mono leading-normal">
                          College: <span className="text-white font-semibold">{scanResult?.student?.college}</span>
                        </p>
                        {(scanResult?.student?.program || scanResult?.student?.section) && (
                          <p className="text-xs md:text-sm opacity-90 font-mono leading-normal">
                            Program / Section: <span className="text-white font-semibold">
                              {[scanResult?.student?.program, scanResult?.student?.section].filter(Boolean).join(" / ")}
                            </span>
                          </p>
                        )}
                        <p className="text-[10px] md:text-xs opacity-75 font-mono">
                          {scanState === "valid" 
                            ? `🕒 Checked In: ${scanResult?.time_string || "Just now"}`
                            : `⚠️ Checked In: ${scanResult?.original_time} by @${scanResult?.scanned_by_name || "unknown"}`
                          }
                        </p>
                      </div>
                    )}
                  </div>

                  <button 
                    onClick={handleResetScanState} 
                    className="absolute top-4 right-4 text-white/60 hover:text-white hover:bg-white/10 p-1.5 rounded-full cursor-pointer transition-all"
                  >
                    <X className="w-5 h-5" />
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
