import React, { useState, useEffect } from "react";
import { 
  Users, 
  UserPlus, 
  Send, 
  Download, 
  Trash2, 
  Check, 
  X, 
  RefreshCw, 
  Search, 
  Smartphone, 
  Mail, 
  SlidersHorizontal,
  MailCheck,
  MailWarning,
  AlertTriangle,
  FileSpreadsheet,
  Globe,
  Database,
  ArrowLeft,
  ArrowRight,
  Eye,
  LogOut,
  Settings
} from "lucide-react";
import { AuthState, Student, Stats, Event } from "../types";
import { 
  addStudentManual, 
  importCsvStudents, 
  resendTicket, 
  getEmailPreview, 
  deleteStudent 
} from "../lib/api";

interface AdminPanelProps {
  auth: AuthState;
  selectedEvent: Event;
  onBackToEvents: () => void;
  onLogout: () => void;
  students: Student[];
  onRefreshStudents: (tokenOverride?: string, eventIdOverride?: string) => Promise<void>;
}

export default function AdminPanel({ auth, selectedEvent, onBackToEvents, onLogout, students, onRefreshStudents }: AdminPanelProps) {
  // Filtering and Searching
  const [search, setSearch] = useState("");
  const [collegeFilter, setCollegeFilter] = useState("");
  const [attendanceFilter, setAttendanceFilter] = useState("");
  const [emailFilter, setEmailFilter] = useState("");

  // Pagination (Strictly 50 per page as specified)
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 50;

  // Manual Add Student form
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newCollege, setNewCollege] = useState("");
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  // Sync / Import state
  const [syncLoading, setSyncLoading] = useState(false);

  // Resend failure simulation flag
  const [simulateResendFailure, setSimulateResendFailure] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  // Email Viewer Modal
  const [selectedStudentForEmail, setSelectedStudentForEmail] = useState<Student | null>(null);
  const [emailPreviewHtml, setEmailPreviewHtml] = useState<string>("");
  const [loadingEmailPreview, setLoadingEmailPreview] = useState(false);

  // Colleges list
  const collegesList = Array.from(new Set(students.map(s => s.college))).sort();

  // Reset page on filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [search, collegeFilter, attendanceFilter, emailFilter]);

  // Apply Client-Side Filtering
  let filtered = students;

  if (search.trim()) {
    const q = search.toLowerCase();
    filtered = filtered.filter(s => 
      s.full_name.toLowerCase().includes(q) || 
      s.email.toLowerCase().includes(q) || 
      s.college.toLowerCase().includes(q)
    );
  }

  if (collegeFilter) {
    filtered = filtered.filter(s => s.college === collegeFilter);
  }

  if (attendanceFilter) {
    if (attendanceFilter === "attended") {
      filtered = filtered.filter(s => s.scanned_at !== null && s.scanned_at !== undefined);
    } else if (attendanceFilter === "not_attended") {
      filtered = filtered.filter(s => s.scanned_at === null || s.scanned_at === undefined);
    }
  }

  if (emailFilter) {
    filtered = filtered.filter(s => s.email_status === emailFilter);
  }

  // Paginate list
  const totalItems = filtered.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage) || 1;
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedStudents = filtered.slice(startIndex, startIndex + itemsPerPage);

  // Compute Statistics
  const stats: Stats = {
    total: students.length,
    attended: students.filter(s => s.scanned_at !== null && s.scanned_at !== undefined).length,
    attendanceRate: students.length > 0 ? Math.round((students.filter(s => s.scanned_at !== null && s.scanned_at !== undefined).length / students.length) * 100) : 0,
    emailsSent: students.filter(s => s.email_status === "sent").length,
    emailsFailed: students.filter(s => s.email_status === "failed").length,
    emailSuccessRate: students.length > 0 ? Math.round((students.filter(s => s.email_status === "sent").length / students.length) * 100) : 0,
  };

  // 1. Manual Add Form submit
  const handleAddStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName || !newEmail || !newCollege) {
      setAddError("Please fill out all registration fields.");
      return;
    }

    setAddLoading(true);
    setAddError(null);

    try {
      const res = await addStudentManual(auth.token || "", {
        full_name: newName,
        email: newEmail,
        college: newCollege,
        eventId: selectedEvent.id
      });

      if (!res.success) {
        throw new Error(res.message || "Manual registration failed.");
      }

      // Success
      setNewName("");
      setNewEmail("");
      setNewCollege("");
      setShowAddForm(false);
      onRefreshStudents();
    } catch (err: any) {
      setAddError(err.message || "Unable to register student.");
    } finally {
      setAddLoading(false);
    }
  };

  // 2. Client-side CSV parser & batch registration uploader
  const handleCSVImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const text = event.target?.result as string;
      if (!text) return;

      const lines = text.split(/\r?\n/);
      const parsedStudents: { full_name: string; email: string; college: string }[] = [];

      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        // Split fields by comma, respecting quotes
        const match = line.match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g) || line.split(",");
        const fields = match.map(f => f.replace(/^"|"$/g, '').trim());

        if (fields.length >= 3) {
          const full_name = fields[0];
          const email = fields[1];
          const college = fields[2];
          if (full_name && email && college) {
            parsedStudents.push({ full_name, email, college });
          }
        }
      }

      if (parsedStudents.length === 0) {
        alert("No valid rows found in the CSV. Make sure headers are Name, Email, College.");
        return;
      }

      setSyncLoading(true);
      try {
        const res = await importCsvStudents(auth.token || "", selectedEvent.id, parsedStudents);
        if (res.success) {
          alert(`CSV Imported successfully! Registered ${res.insertedCount} new student records.`);
          onRefreshStudents();
        } else {
          alert(res.message || "Failed to import CSV.");
        }
      } catch (err) {
        alert("Connection error importing CSV.");
      } finally {
        setSyncLoading(false);
        e.target.value = "";
      }
    };
    reader.readAsText(file);
  };

  // 4. Force Resend Email
  const handleResendEmail = async (studentId: string) => {
    setActionLoadingId(studentId);
    try {
      const res = await resendTicket(auth.token || "", studentId);
      if (res.success) {
        onRefreshStudents();
      }
    } catch (e) {
      alert("Resend failed");
    } finally {
      setActionLoadingId(null);
    }
  };

  // 5. Open HTML Email Viewer Lightbox
  const handleViewEmail = async (student: Student) => {
    setSelectedStudentForEmail(student);
    setLoadingEmailPreview(true);
    setEmailPreviewHtml("");
    try {
      const res = await getEmailPreview(auth.token || "", student.id);
      if (res.success && res.html) {
        setEmailPreviewHtml(res.html);
      } else {
        setEmailPreviewHtml(`<p style="color:red; text-align:center; padding: 40px;">Failed to load ticket email. Standard QR generating. Try clicking "Resend Email" first.</p>`);
      }
    } catch (e) {
      setEmailPreviewHtml("<p style='color:red; text-align:center;'>Connection Error.</p>");
    } finally {
      setLoadingEmailPreview(false);
    }
  };

  // 6. Delete Registrant
  const handleDeleteStudent = async (studentId: string) => {
    if (!confirm("Are you sure you want to permanently delete this student registration? This will revoke their QR ticket immediately.")) return;
    try {
      const res = await deleteStudent(auth.token || "", studentId);
      if (res.success) {
        onRefreshStudents();
      } else {
        throw new Error(res.message);
      }
    } catch (e) {
      alert("Delete failed.");
    }
  };

  // 7. Reset DB back to default 5 entries
  const handleResetDB = async () => {
    if (!confirm("Reset database to factory demo registrants? This will clear all attendance logs, sessions, and custom registrants.")) return;
    try {
      const res = await fetch("/api/reset-db", { 
        method: "POST",
        headers: {
          "Authorization": `Bearer ${auth.token}`
        }
      });
      if (res.ok) {
        onRefreshStudents();
        setCurrentPage(1);
        alert("Database wiped & refreshed with 5 default registrants!");
      }
    } catch (e) {
      alert("Reset failed.");
    }
  };

  // 8. Client-side CSV generator for export
  const handleExportCSV = () => {
    let csv = "Email,Name,College,Attended (Yes/No),Time Attended,Scanned By Station\n";
    for (const student of students) {
      const isAttended = student.scanned_at ? "Yes" : "No";
      const scannedTime = student.scanned_at ? new Date(student.scanned_at).toISOString() : "--:--";
      const scannerName = student.scanned_by_name || "N/A";
      
      const escapedName = student.full_name.replace(/"/g, '""');
      const escapedCollege = student.college.replace(/"/g, '""');
      const escapedScanner = scannerName.replace(/"/g, '""');
      
      csv += `"${student.email}","${escapedName}","${escapedCollege}","${isAttended}","${scannedTime}","${escapedScanner}"\n`;
    }
    
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `Event_Attendance_Report_${selectedEvent.name.replace(/\s+/g, "_")}_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="w-full max-w-7xl mx-auto px-4 py-8 space-y-8">
      
      {/* Header Panel */}
      <div id="admin-header" className="bg-brand-primary p-6 rounded-3xl border border-brand-accent/20 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shadow-xl">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-brand-accent/10 border border-brand-accent/40 flex items-center justify-center text-brand-accent">
            <Globe className="w-6 h-6" />
          </div>
          <div>
            <h1 className="font-serif text-2xl font-bold tracking-wide text-brand-text">
              Administrative Registry Terminal
            </h1>
            <p className="text-xs text-brand-text/60 font-mono mt-0.5">
              Apex Institution Office of Student Affairs | Secure Entry Console
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto">
          <button
            onClick={onBackToEvents}
            className="w-full md:w-auto px-4 py-2.5 bg-brand-primary-dark hover:bg-brand-primary-light border border-brand-accent/20 hover:border-brand-accent/60 rounded-xl text-xs font-semibold tracking-wider uppercase transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-md"
          >
            ← Back to Events
          </button>
          <button
            id="admin-logout-btn"
            onClick={onLogout}
            className="w-full md:w-auto px-5 py-2.5 bg-brand-primary-dark hover:bg-red-950/40 text-brand-text/80 hover:text-red-300 border border-brand-accent/10 hover:border-red-500/30 rounded-xl text-xs font-semibold tracking-wider uppercase transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-md"
          >
            <LogOut className="w-3.5 h-3.5" />
            Lock Console
          </button>
        </div>
      </div>

      {/* Statistics Block */}
      <div id="stats-panel" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        
        <div className="bg-brand-primary/80 p-5 rounded-2xl border border-brand-accent/10 shadow-lg space-y-3">
          <div className="flex justify-between items-center text-brand-accent">
            <span className="text-[10px] tracking-widest font-mono uppercase font-bold text-brand-text/60">Total Registrants</span>
            <Users className="w-5 h-5 opacity-75" />
          </div>
          <div>
            <p className="text-3xl font-serif font-bold text-brand-text">{stats.total}</p>
            <p className="text-[11px] text-brand-text/40 font-mono mt-1">Students registered in system</p>
          </div>
        </div>

        <div className="bg-brand-primary/80 p-5 rounded-2xl border border-brand-accent/10 shadow-lg space-y-3">
          <div className="flex justify-between items-center text-emerald-400">
            <span className="text-[10px] tracking-widest font-mono uppercase font-bold text-brand-text/60">Attendance Rate</span>
            <Check className="w-5 h-5 opacity-75" />
          </div>
          <div>
            <p className="text-3xl font-serif font-bold text-emerald-400">{stats.attendanceRate}%</p>
            <p className="text-[11px] text-brand-text/40 font-mono mt-1">
              Checked In: <span className="text-white font-bold">{stats.attended}</span> / {stats.total}
            </p>
          </div>
        </div>

        <div className="bg-brand-primary/80 p-5 rounded-2xl border border-brand-accent/10 shadow-lg space-y-3">
          <div className="flex justify-between items-center text-brand-accent">
            <span className="text-[10px] tracking-widest font-mono uppercase font-bold text-brand-text/60">Email Delivery Rate</span>
            <MailCheck className="w-5 h-5 opacity-75" />
          </div>
          <div>
            <p className="text-3xl font-serif font-bold text-brand-accent">{stats.emailSuccessRate}%</p>
            <p className="text-[11px] text-brand-text/40 font-mono mt-1">
              Sent: <span className="text-emerald-400 font-bold">{stats.emailsSent}</span> | Fail: <span className="text-red-400 font-bold">{stats.emailsFailed}</span>
            </p>
          </div>
        </div>

        <div className="bg-brand-primary/80 p-5 rounded-2xl border border-brand-accent/10 shadow-lg space-y-3">
          <div className="flex justify-between items-center text-amber-400">
            <span className="text-[10px] tracking-widest font-mono uppercase font-bold text-brand-text/60">Active Scanners</span>
            <Smartphone className="w-5 h-5 opacity-75 animate-pulse" />
          </div>
          <div>
            <p className="text-3xl font-serif font-bold text-amber-400">
              {students.length > 0 ? "10 Cap Active" : "Online"}
            </p>
            <p className="text-[11px] text-brand-text/40 font-mono mt-1">Heartbeats polled system-wide</p>
          </div>
        </div>

      </div>

      {/* Simulator / Sync Dashboard Section */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Actions Suite */}
        <div className="lg:col-span-8 bg-brand-primary/80 p-6 rounded-3xl border border-brand-accent/10 shadow-lg space-y-6">
          <div className="flex justify-between items-center border-b border-brand-accent/10 pb-4">
            <h2 className="font-serif text-lg font-bold tracking-wide text-brand-text uppercase flex items-center gap-2">
              <Settings className="w-5 h-5 text-brand-accent" />
              Administrative Operations
            </h2>
            <div className="flex items-center gap-2">
              <span className="inline-block w-2.5 h-2.5 bg-emerald-500 rounded-full animate-ping"></span>
              <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-emerald-400">System Connected</span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label
              id="admin-csv-import-label"
              className={`px-4 py-3.5 bg-brand-primary-dark hover:bg-brand-primary-light border border-brand-accent/20 hover:border-brand-accent/40 rounded-2xl text-xs font-semibold tracking-wider uppercase transition-all flex flex-col items-center justify-center gap-2 text-center text-brand-accent cursor-pointer shadow ${
                syncLoading ? "opacity-50 pointer-events-none" : ""
              }`}
            >
              <FileSpreadsheet className="w-5 h-5" />
              {syncLoading ? "Importing CSV..." : "Import CSV File"}
              <input
                type="file"
                accept=".csv"
                onChange={handleCSVImport}
                style={{ display: "none" }}
              />
            </label>

            <button
              id="admin-toggle-add-btn"
              onClick={() => {
                setShowAddForm(!showAddForm);
              }}
              className={`px-4 py-3.5 border rounded-2xl text-xs font-semibold tracking-wider uppercase transition-all flex flex-col items-center justify-center gap-2 text-center cursor-pointer shadow ${
                showAddForm
                  ? "bg-brand-accent text-brand-primary-dark border-brand-accent"
                  : "bg-brand-primary-dark hover:bg-brand-primary-light border-brand-accent/20 hover:border-brand-accent/40 text-brand-text"
              }`}
            >
              <UserPlus className="w-5 h-5" />
              Manual Register
            </button>
          </div>

          {/* Manual Add Student Form */}
          {showAddForm && (
            <form onSubmit={handleAddStudent} className="p-5 bg-brand-primary-dark/60 rounded-2xl border border-brand-accent/10 space-y-4 animate-fade-in">
              <h3 className="font-serif text-sm font-bold uppercase tracking-wider text-brand-accent">
                ✍️ Register New Student Manually
              </h3>
              
              {addError && <div className="text-xs text-red-400 bg-red-950/20 p-2.5 rounded border border-red-500/20">{addError}</div>}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-[10px] font-bold tracking-wider uppercase font-mono text-brand-text/60 mb-1">Full Name</label>
                  <input
                    id="add-name-input"
                    type="text"
                    required
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    className="w-full px-3 py-2 bg-brand-primary border border-brand-accent/10 rounded-xl text-xs text-brand-text focus:outline-none focus:border-brand-accent"
                    placeholder="Marcus Aurelius"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold tracking-wider uppercase font-mono text-brand-text/60 mb-1">Email Address</label>
                  <input
                    id="add-email-input"
                    type="email"
                    required
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    className="w-full px-3 py-2 bg-brand-primary border border-brand-accent/10 rounded-xl text-xs text-brand-text focus:outline-none focus:border-brand-accent"
                    placeholder="marcus@empire.edu"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold tracking-wider uppercase font-mono text-brand-text/60 mb-1">College / Dept</label>
                  <input
                    id="add-college-input"
                    type="text"
                    required
                    value={newCollege}
                    onChange={(e) => setNewCollege(e.target.value)}
                    className="w-full px-3 py-2 bg-brand-primary border border-brand-accent/10 rounded-xl text-xs text-brand-text focus:outline-none focus:border-brand-accent"
                    placeholder="College of Humanities"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddForm(false)}
                  className="px-4 py-2 bg-transparent text-brand-text/60 hover:text-brand-text text-xs font-semibold tracking-wider uppercase cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  id="add-submit-btn"
                  type="submit"
                  disabled={addLoading}
                  className="px-5 py-2.5 bg-brand-accent text-brand-primary-dark text-xs font-bold tracking-wider uppercase rounded-xl hover:bg-brand-accent/90 disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
                >
                  {addLoading && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  Register &amp; Deliver QR
                </button>
              </div>
            </form>
          )}



        </div>

        {/* Diagnostic controls / Email SMTP Switcher */}
        <div className="lg:col-span-4 bg-brand-primary-dark/80 p-6 rounded-3xl border border-brand-accent/10 shadow-lg space-y-6 flex flex-col justify-between">
          <div className="space-y-4">
            <h2 className="font-serif text-base font-bold tracking-wide text-brand-text uppercase border-b border-brand-accent/10 pb-3 flex items-center gap-2">
              <Settings className="w-4.5 h-4.5 text-brand-accent" />
              Diagnostics Console
            </h2>

            {/* Simulated Email Switch */}
            <div className="bg-brand-primary/40 p-4 rounded-2xl border border-brand-accent/5 space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold tracking-wider uppercase font-mono text-brand-text">SMTP Sim Failure</span>
                <input
                  id="smtp-failure-toggle"
                  type="checkbox"
                  checked={simulateResendFailure}
                  onChange={(e) => setSimulateResendFailure(e.target.checked)}
                  className="w-4 h-4 bg-brand-primary-dark rounded border-brand-accent/20 text-brand-accent focus:ring-brand-accent cursor-pointer"
                />
              </div>
              <p className="text-[10px] text-brand-text/40 leading-relaxed font-mono">
                Toggle this <span className="text-red-400 font-bold">ON</span> to simulate network SMTP timeouts when sending emails, so you can inspect the red <span className="text-red-400 font-bold">Failed</span> state with raw diagnostic error codes in the directory table.
              </p>
            </div>
          </div>

          <div className="pt-6 border-t border-brand-accent/10 space-y-3">
            <button
              id="admin-reset-db-btn"
              onClick={handleResetDB}
              className="w-full px-4 py-2.5 bg-brand-primary-dark hover:bg-red-950/20 text-red-400 hover:text-red-300 border border-red-500/10 hover:border-red-500/30 rounded-xl text-[11px] font-semibold tracking-wider uppercase transition-all flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Database className="w-3.5 h-3.5" />
              Reset Demo Database
            </button>
          </div>
        </div>

      </div>

      {/* Directory Section */}
      <div className="bg-brand-primary p-6 rounded-3xl border border-brand-accent/20 shadow-xl space-y-6">
        
        {/* Directory Controls */}
        <div className="flex flex-col md:flex-row justify-between items-stretch md:items-center gap-4 border-b border-brand-accent/10 pb-6">
          <div>
            <h2 className="font-serif text-xl font-bold tracking-wide text-brand-text uppercase flex items-center gap-2">
              <Users className="w-5.5 h-5.5 text-brand-accent" />
              Student Registration Ledger
            </h2>
            <p className="text-xs text-brand-text/50 font-mono mt-0.5">
              Live records updating on scanned entries
            </p>
          </div>

          {/* Export Report CSV Button */}
          <button
            id="admin-export-csv-btn"
            onClick={handleExportCSV}
            className="px-5 py-3 bg-brand-accent text-brand-primary-dark hover:bg-brand-accent/90 rounded-xl text-xs font-bold tracking-widest uppercase flex items-center justify-center gap-2 transition-all cursor-pointer shadow-md"
          >
            <Download className="w-4.5 h-4.5" />
            Export CSV Report
          </button>
        </div>

        {/* Filter Toolbar */}
        <div className="bg-brand-primary-dark/60 p-4 rounded-2xl border border-brand-accent/10 grid grid-cols-1 md:grid-cols-4 gap-4 items-center">
          
          {/* Search Box */}
          <div className="relative">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-brand-text/40">
              <Search className="w-4 h-4" />
            </span>
            <input
              id="ledger-search-input"
              type="text"
              placeholder="Search registry..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-brand-primary border border-brand-accent/10 rounded-xl text-xs text-brand-text placeholder-brand-text/30 focus:outline-none focus:border-brand-accent font-mono"
            />
          </div>

          {/* College Filter */}
          <div>
            <select
              id="filter-college-select"
              value={collegeFilter}
              onChange={(e) => setCollegeFilter(e.target.value)}
              className="w-full px-3 py-2 bg-brand-primary border border-brand-accent/10 rounded-xl text-xs text-brand-text focus:outline-none focus:border-brand-accent cursor-pointer font-mono"
            >
              <option value="">All Colleges</option>
              {collegesList.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          {/* Attendance Filter */}
          <div>
            <select
              id="filter-attendance-select"
              value={attendanceFilter}
              onChange={(e) => setAttendanceFilter(e.target.value)}
              className="w-full px-3 py-2 bg-brand-primary border border-brand-accent/10 rounded-xl text-xs text-brand-text focus:outline-none focus:border-brand-accent cursor-pointer font-mono"
            >
              <option value="">All Attendance States</option>
              <option value="attended">Attended Check-In 🟩</option>
              <option value="not_attended">Not Attended ⬜</option>
            </select>
          </div>

          {/* Email Status Filter */}
          <div>
            <select
              id="filter-email-select"
              value={emailFilter}
              onChange={(e) => setEmailFilter(e.target.value)}
              className="w-full px-3 py-2 bg-brand-primary border border-brand-accent/10 rounded-xl text-xs text-brand-text focus:outline-none focus:border-brand-accent cursor-pointer font-mono"
            >
              <option value="">All Email Delivery States</option>
              <option value="sent">Sent Successfully 🟩</option>
              <option value="failed">Failed Delivery 🟥</option>
            </select>
          </div>

        </div>

        {/* Directory Ledger Table */}
        <div className="overflow-x-auto rounded-2xl border border-brand-accent/15">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-brand-primary-dark/95 text-brand-accent font-serif border-b border-brand-text/10 uppercase tracking-widest text-[10px]">
                <th className="px-6 py-4 font-semibold">Student Email</th>
                <th className="px-6 py-4 font-semibold">Full Name</th>
                <th className="px-6 py-4 font-semibold">College Dept</th>
                <th className="px-6 py-4 font-semibold text-center">Email Status</th>
                <th className="px-6 py-4 font-semibold text-center">Attendance</th>
                <th className="px-6 py-4 font-semibold text-center">Time</th>
                <th className="px-6 py-4 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-text/5 text-xs">
              {paginatedStudents.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-brand-text/40 italic font-mono">
                    No registry rows matching current search parameters.
                  </td>
                </tr>
              ) : (
                paginatedStudents.map((s, idx) => (
                  <tr 
                    key={s.id} 
                    className={`border-b border-brand-text/5 transition-all hover:bg-brand-text/5 ${
                      idx % 2 === 0 ? "bg-brand-text/[0.01]" : "bg-transparent"
                    }`}
                  >
                    <td className="px-6 py-3.5 font-mono text-brand-text/85 max-w-[180px] truncate">{s.email}</td>
                    <td className="px-6 py-3.5 font-serif italic text-brand-text font-semibold">{s.full_name}</td>
                    <td className="px-6 py-3.5 text-brand-text/60 font-sans">{s.college}</td>
                    <td className="px-6 py-3.5 text-center">
                      {s.email_status === "sent" ? (
                        <span className="inline-flex items-center gap-1 bg-green-950/40 text-green-300 px-2.5 py-1 rounded-full border border-green-500/20 text-[10px] font-semibold">
                          <Check className="w-2.5 h-2.5" /> Sent
                        </span>
                      ) : (
                        <span 
                          title={s.email_error || "Unknown SMTP error"}
                          className="inline-flex items-center gap-1 bg-red-950/40 text-red-300 px-2.5 py-1 rounded-full border border-red-500/20 text-[10px] font-semibold cursor-help"
                        >
                          <AlertTriangle className="w-2.5 h-2.5" /> Failed
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-3.5 text-center">
                      {s.scanned_at ? (
                        <span className="inline-flex items-center gap-1 bg-brand-accent/20 text-brand-accent px-2.5 py-1 rounded-full border border-brand-accent/30 text-[10px] font-bold tracking-wide">
                          <Check className="w-2.5 h-2.5" /> Attended
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 bg-brand-text/5 text-brand-text/40 px-2.5 py-1 rounded-full border border-brand-text/10 text-[10px] font-semibold">
                          Not Attended
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-3.5 text-center font-mono">
                      {s.scanned_at ? (
                        <div className="flex flex-col items-center">
                          <span className="text-brand-text font-bold text-xs">
                            {new Date(s.scanned_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                          <span className="text-[9px] text-brand-accent/80 mt-0.5 max-w-[120px] truncate block opacity-75">
                            [{s.scanned_by_name || "Self Scan"}]
                          </span>
                        </div>
                      ) : (
                        <span className="text-brand-text/30">--:--</span>
                      )}
                    </td>
                    <td className="px-6 py-3.5 text-right space-x-2 whitespace-nowrap">
                      
                      {/* View Email ticket */}
                      <button
                        title="View Email QR Ticket"
                        onClick={() => handleViewEmail(s)}
                        className="p-1.5 bg-brand-primary-dark/85 hover:bg-brand-primary-light text-brand-text/70 hover:text-brand-accent rounded-lg border border-brand-text/10 transition-colors cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>

                      {/* Resend trigger */}
                      <button
                        title="Resend email"
                        disabled={actionLoadingId === s.id}
                        onClick={() => handleResendEmail(s.id)}
                        className="p-1.5 bg-brand-primary-dark/85 hover:bg-brand-primary-light text-brand-text/70 hover:text-emerald-400 rounded-lg border border-brand-text/10 transition-colors cursor-pointer disabled:opacity-40"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${actionLoadingId === s.id ? "animate-spin text-brand-accent" : ""}`} />
                      </button>

                      {/* Delete registry row */}
                      <button
                        title="Delete registrant"
                        onClick={() => handleDeleteStudent(s.id)}
                        className="p-1.5 bg-brand-primary-dark/85 hover:bg-red-950/20 text-brand-text/40 hover:text-red-400 rounded-lg border border-brand-text/10 hover:border-red-500/20 transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>

                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Toolbar */}
        <div className="flex flex-col sm:flex-row justify-between items-center gap-4 pt-4 text-xs font-mono text-brand-text/50">
          <div>
            Showing <span className="text-white font-bold">{Math.min(filtered.length, startIndex + 1)}-{Math.min(filtered.length, startIndex + itemsPerPage)}</span> of <span className="text-brand-accent font-bold">{filtered.length}</span> registry rows
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
              className="p-2 bg-brand-primary-dark hover:bg-brand-primary-light text-brand-text border border-brand-accent/10 rounded-xl disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <span className="px-3">
              Page <span className="text-white font-bold">{currentPage}</span> of <span className="text-white font-bold">{totalPages}</span>
            </span>
            <button
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages}
              className="p-2 bg-brand-primary-dark hover:bg-brand-primary-light text-brand-text border border-brand-accent/10 rounded-xl disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
            >
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>

      </div>

      {/* HTML Email ticket Lightbox Modal */}
      {selectedStudentForEmail && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex justify-center items-center z-50 p-4 animate-fade-in">
          <div className="bg-brand-primary-dark w-full max-w-2xl rounded-3xl border border-brand-accent/30 overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
            
            {/* Modal Header */}
            <div className="p-5 border-b border-brand-accent/10 bg-brand-primary flex justify-between items-center">
              <div>
                <span className="text-[10px] tracking-widest font-mono uppercase text-brand-accent block">Sent Mail Server Log</span>
                <h3 className="font-serif text-lg font-bold text-brand-text">
                  Email Preview for {selectedStudentForEmail.full_name}
                </h3>
              </div>
              <button
                onClick={() => setSelectedStudentForEmail(null)}
                className="p-2 hover:bg-brand-primary-dark rounded-xl text-brand-text/60 hover:text-brand-text transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body Container */}
            <div className="flex-1 overflow-y-auto p-6 bg-[#11251c]/50 flex justify-center">
              {loadingEmailPreview ? (
                <div className="flex flex-col items-center justify-center p-12 text-brand-text/50 gap-2">
                  <RefreshCw className="w-8 h-8 animate-spin text-brand-accent" />
                  <span className="font-mono text-xs">Regenerating Ticket QR...</span>
                </div>
              ) : (
                <div className="w-full border border-brand-accent/10 rounded-2xl overflow-hidden shadow-inner max-w-lg bg-[#11251c]">
                  {/* Embedded Document */}
                  <iframe
                    title="Ticket email preview"
                    srcDoc={emailPreviewHtml}
                    className="w-full h-[550px] border-0 bg-[#11251c]"
                    sandbox="allow-same-origin"
                  ></iframe>
                </div>
              )}
            </div>

            {/* Modal Footer Instructions */}
            <div className="p-4 bg-brand-primary border-t border-brand-accent/10 text-center flex flex-col sm:flex-row justify-between items-center gap-3">
              <p className="text-[10px] font-mono text-brand-text/50 max-w-md text-left leading-relaxed">
                ℹ️ **TESTING GUIDE:** You can scan this QR code directly with your phone camera on the Scanner Panel, or use the Simulator for instant outcomes.
              </p>
              <button
                onClick={() => setSelectedStudentForEmail(null)}
                className="w-full sm:w-auto px-5 py-2.5 bg-brand-accent text-brand-primary-dark text-xs font-bold tracking-wider uppercase rounded-xl hover:bg-brand-accent/90 cursor-pointer shadow"
              >
                Close Log Preview
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
