import React, { useState, useEffect } from "react";
import { Plus, Edit3, Trash2, Calendar, MapPin, LogOut, Loader2, Sparkles } from "lucide-react";
import { Event, AuthState } from "../types";
import { fetchEvents as fetchEventsFromApi, updateEvent, createEvent, deleteEvent } from "../lib/api";

interface EventsMenuProps {
  auth: AuthState;
  onSelectEvent: (event: Event) => void;
  onLogout: () => void;
}

export default function EventsMenu({ auth, onSelectEvent, onLogout }: EventsMenuProps) {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal States
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<Event | null>(null);

  // Form States
  const [name, setName] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [venue, setVenue] = useState("");
  const [description, setDescription] = useState("");
  const [bannerUrl, setBannerUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (auth.token) {
      fetchEvents();
    }
  }, [auth.token]);

  const fetchEvents = async () => {
    if (!auth.token) return;
    setLoading(true);
    try {
      const data = await fetchEventsFromApi(auth.token);
      setEvents(data);
    } catch (err: any) {
      setError(err.message || "Network error loading events.");
    } finally {
      setLoading(false);
    }
  };

  const handleOpenAddModal = () => {
    setEditingEvent(null);
    setName("");
    setEventDate("");
    setVenue("");
    setDescription("");
    setBannerUrl("");
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (event: Event) => {
    setEditingEvent(event);
    setName(event.name);
    setEventDate(event.event_date);
    setVenue(event.venue);
    setDescription(event.description);
    setBannerUrl(event.banner_url);
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !eventDate || !venue || !description || !bannerUrl) {
      alert("Please fill in all event details.");
      return;
    }

    setSubmitting(true);
    const body = { name, event_date: eventDate, venue, description, banner_url: bannerUrl };

    try {
      if (editingEvent) {
        const result = await updateEvent(auth.token || "", editingEvent.id, body);
        if (!result.success) throw new Error(result.message || "Failed to save event.");
      } else {
        const result = await createEvent(auth.token || "", body);
        if (!result.success) throw new Error(result.message || "Failed to create event.");
      }
      setIsModalOpen(false);
      fetchEvents();
    } catch (err: any) {
      alert(err.message || "An error occurred.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (event: Event) => {
    const confirmed = window.confirm(
      `⚠️ WARNING: Deleting "${event.name}" will permanently erase all registered student records, check-in sheets, email histories, and signed tokens from the database. This action CANNOT be undone.\n\nType 'OK' in the confirm prompt to proceed.`
    );
    if (!confirmed) return;

    try {
      const result = await deleteEvent(auth.token || "", event.id);
      if (!result.success) throw new Error(result.message || "Failed to delete event.");
      fetchEvents();
    } catch (err: any) {
      alert(err.message || "An error occurred.");
    }
  };

  const isAdmin = auth.role === "admin";

  return (
    <div className="min-h-screen bg-brand-primary-dark text-brand-text flex flex-col">
      {/* Header Banner */}
      <header className="border-b border-brand-accent/15 bg-brand-primary-light/50 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-brand-accent/15 flex items-center justify-center text-brand-accent border border-brand-accent/30 shadow-inner">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h1 className="font-serif text-xl md:text-2xl font-bold tracking-tight uppercase" style={{ fontFamily: "Georgia, serif" }}>
                University of Makati Student Council
              </h1>
              <p className="text-[9px] text-brand-accent font-mono tracking-widest uppercase">
                {isAdmin ? "ADMINISTRATIVE CONTROL PANEL" : "GATE CHECK-IN SELECTOR"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-right hidden sm:block">
              <p className="text-xs font-semibold text-brand-text/95">{auth.user?.username}</p>
              <p className="text-[10px] text-brand-text/50 font-mono">{auth.user?.committee_name}</p>
            </div>
            <button
              onClick={onLogout}
              className="flex items-center gap-2 px-3 py-2 bg-brand-primary-dark/80 hover:bg-red-950/40 hover:text-red-200 border border-brand-accent/15 hover:border-red-500/30 rounded-xl text-xs font-medium cursor-pointer transition-all duration-300 shadow-md active:scale-95"
            >
              <LogOut className="w-4 h-4" />
              Lock Console
            </button>
          </div>
        </div>
      </header>

      {/* Main Body Grid */}
      <main className="flex-grow max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 w-full">
        {error && (
          <div className="mb-8 p-4 rounded-xl bg-red-950/40 border border-red-500/30 text-red-200 text-sm">
            <strong>Failed loading Events:</strong> {error}
          </div>
        )}

        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
          <div>
            <h2 className="text-xl md:text-2xl font-serif text-brand-text" style={{ fontFamily: "Georgia, serif" }}>
              Active Programs & Summits
            </h2>
            <p className="text-xs text-brand-text/60 mt-1">
              Select an event below to manage registrants or launch scanner stations.
            </p>
          </div>

          {isAdmin && (
            <button
              onClick={handleOpenAddModal}
              className="flex items-center gap-2 px-4 py-2.5 bg-brand-accent text-brand-primary-dark rounded-xl text-xs font-bold uppercase tracking-wider hover:bg-brand-accent/90 cursor-pointer shadow-lg transition-transform duration-200 active:scale-95"
            >
              <Plus className="w-4 h-4" />
              Create Event
            </button>
          )}
        </div>

        {loading ? (
          <div className="flex flex-col justify-center items-center py-20 gap-3">
            <Loader2 className="w-10 h-10 animate-spin text-brand-accent" />
            <p className="text-xs text-brand-text/50 font-mono uppercase tracking-wider">Syncing Events Database...</p>
          </div>
        ) : events.length === 0 ? (
          <div className="border border-dashed border-brand-accent/15 rounded-2xl p-12 text-center max-w-md mx-auto my-10 bg-brand-primary-light/10">
            <Calendar className="w-12 h-12 text-brand-accent/40 mx-auto mb-4" />
            <h3 className="text-md font-serif text-brand-text/80 mb-2">No events configured yet</h3>
            <p className="text-xs text-brand-text/50 mb-6">
              Create an event record to establish the registration roster and generate scanning credentials.
            </p>
            {isAdmin && (
              <button
                onClick={handleOpenAddModal}
                className="px-4 py-2 bg-brand-accent text-brand-primary-dark text-xs font-bold uppercase rounded-lg hover:bg-brand-accent/90"
              >
                Create First Event
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {events.map((event) => (
              <div
                key={event.id}
                className="group relative flex flex-col bg-brand-primary-light rounded-2xl overflow-hidden border border-brand-text/10 shadow-lg hover:shadow-2xl transition-all duration-300 hover:scale-[1.02] hover:border-brand-accent/30"
              >
                {/* Banner Thumbnail */}
                <div className="h-44 relative bg-brand-primary-dark overflow-hidden">
                  <img
                    src={event.banner_url}
                    alt={event.name}
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-brand-primary-light via-brand-primary-light/40 to-transparent"></div>
                  
                  {/* Badge */}
                  <span className="absolute top-4 left-4 bg-brand-primary-dark/80 backdrop-blur-md text-brand-accent text-[9px] font-mono tracking-widest px-2.5 py-1 rounded-full border border-brand-accent/20 uppercase">
                    Apex Event
                  </span>
                </div>

                {/* Info Content */}
                <div className="p-6 flex-grow flex flex-col justify-between">
                  <div>
                    <h3 className="text-lg font-serif font-bold text-brand-text leading-snug mb-3 group-hover:text-brand-accent transition-colors" style={{ fontFamily: "Georgia, serif" }}>
                      {event.name}
                    </h3>
                    
                    <p className="text-xs text-brand-text/75 line-clamp-3 mb-6">
                      {event.description}
                    </p>
                  </div>

                  <div className="space-y-2 mb-6">
                    <div className="flex items-center gap-2.5 text-xs text-brand-text/60">
                      <Calendar className="w-4 h-4 text-brand-accent/80 flex-shrink-0" />
                      <span>{event.event_date}</span>
                    </div>
                    <div className="flex items-center gap-2.5 text-xs text-brand-text/60">
                      <MapPin className="w-4 h-4 text-brand-accent/80 flex-shrink-0" />
                      <span>{event.venue}</span>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => onSelectEvent(event)}
                      className="flex-grow py-3 bg-brand-accent hover:bg-brand-accent/90 text-brand-primary-dark font-bold text-xs uppercase tracking-wider rounded-xl cursor-pointer transition-colors shadow-md text-center"
                    >
                      {isAdmin ? "Manage Dashboard" : "Launch Scanner Console"}
                    </button>

                    {isAdmin && (
                      <>
                        <button
                          onClick={() => handleOpenEditModal(event)}
                          title="Edit Event"
                          className="p-3 bg-brand-primary-dark hover:bg-brand-primary border border-brand-accent/15 hover:border-brand-accent/40 text-brand-accent rounded-xl cursor-pointer transition-colors active:scale-95"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(event)}
                          title="Delete Event"
                          className="p-3 bg-brand-primary-dark hover:bg-red-950/40 border border-brand-accent/15 hover:border-red-500/40 text-brand-text/60 hover:text-red-400 rounded-xl cursor-pointer transition-colors active:scale-95"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Modal Dialog */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="w-full max-w-xl bg-brand-primary-light border border-brand-accent/25 rounded-2xl shadow-2xl relative overflow-hidden my-8">
            <div className="absolute top-0 left-0 right-0 h-1 bg-brand-accent"></div>
            
            <div className="px-6 py-5 border-b border-brand-accent/10 flex justify-between items-center">
              <h3 className="text-lg font-serif font-bold text-brand-text" style={{ fontFamily: "Georgia, serif" }}>
                {editingEvent ? "Edit Event Config" : "Configure New Event"}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-brand-text/50 hover:text-brand-text text-sm cursor-pointer"
              >
                ✕ Close
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-[10px] font-mono tracking-widest uppercase text-brand-text/60 mb-1">
                  Event Title
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g., Vibrant Event Tech Summit 2026"
                  className="w-full px-4 py-2.5 bg-brand-primary-dark border border-brand-accent/15 rounded-xl text-sm focus:outline-none focus:border-brand-accent"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-mono tracking-widest uppercase text-brand-text/60 mb-1">
                    Date & Time
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g., October 24, 2026 at 1:00 PM"
                    className="w-full px-4 py-2.5 bg-brand-primary-dark border border-brand-accent/15 rounded-xl text-sm focus:outline-none focus:border-brand-accent"
                    value={eventDate}
                    onChange={(e) => setEventDate(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-mono tracking-widest uppercase text-brand-text/60 mb-1">
                    Venue
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g., UMak Grand Theater"
                    className="w-full px-4 py-2.5 bg-brand-primary-dark border border-brand-accent/15 rounded-xl text-sm focus:outline-none focus:border-brand-accent"
                    value={venue}
                    onChange={(e) => setVenue(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-mono tracking-widest uppercase text-brand-text/60 mb-1">
                  Banner Image URL
                </label>
                <input
                  type="url"
                  required
                  placeholder="https://images.unsplash.com/photo-..."
                  className="w-full px-4 py-2.5 bg-brand-primary-dark border border-brand-accent/15 rounded-xl text-sm focus:outline-none focus:border-brand-accent"
                  value={bannerUrl}
                  onChange={(e) => setBannerUrl(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-[10px] font-mono tracking-widest uppercase text-brand-text/60 mb-1">
                  Description / Reminder (Included in Confirmation Ticket Email)
                </label>
                <textarea
                  required
                  rows={4}
                  placeholder="Please download your ticket QR and arrive 15 minutes prior to verify check-in."
                  className="w-full px-4 py-2.5 bg-brand-primary-dark border border-brand-accent/15 rounded-xl text-sm focus:outline-none focus:border-brand-accent resize-none"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>

              <div className="pt-4 border-t border-brand-accent/10 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 bg-brand-primary-dark border border-brand-accent/15 text-brand-text/80 rounded-xl text-xs font-bold uppercase hover:bg-brand-primary cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 bg-brand-accent text-brand-primary-dark rounded-xl text-xs font-bold uppercase hover:bg-brand-accent/90 disabled:opacity-50 cursor-pointer flex items-center justify-center"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin mr-1.5" />
                      Saving...
                    </>
                  ) : (
                    "Save Event"
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
