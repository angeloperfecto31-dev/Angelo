import React, { useState, useEffect } from "react";
import {
  collection,
  onSnapshot,
  doc,
  setDoc,
  addDoc,
  deleteDoc,
  query,
} from "firebase/firestore";
import { db } from "../firebase";
import {
  Bell,
  Plus,
  Edit2,
  Trash2,
  Eye,
  Calendar,
  Layers,
  Pin,
  Clock,
  CheckCircle,
  AlertTriangle,
  User,
  Shield,
  FileText,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import {
  handleFirestoreError,
  OperationType,
} from "../utils/firestoreError";
import {
  WebsiteUpdate,
  UpdateCategory,
  UpdateVisibility,
} from "../types/updates";

interface Props {
  adminEmail: string | undefined;
}

export const UpdateManagement: React.FC<Props> = ({ adminEmail }) => {
  const [updates, setUpdates] = useState<WebsiteUpdate[]>([]);
  const [loading, setLoading] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingUpdate, setEditingUpdate] = useState<WebsiteUpdate | null>(
    null
  );

  // Form Fields
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<UpdateCategory>("New Features");
  const [version, setVersion] = useState("v1.0.0");
  const [visibility, setVisibility] = useState<UpdateVisibility>("all");
  const [releasedAt, setReleasedAt] = useState("");
  const [detailedNotes, setDetailedNotes] = useState("");
  const [isPinned, setIsPinned] = useState(false);

  const categories: UpdateCategory[] = [
    "New Features",
    "Improvements",
    "Bug Fixes",
    "Maintenance",
    "Security Updates",
    "General Announcements",
  ];

  // 1. Fetch all updates (real-time, including future/scheduled ones for admin review)
  useEffect(() => {
    const q = query(collection(db, "websiteUpdates"));
    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const list: WebsiteUpdate[] = [];
        snapshot.forEach((d) => {
          list.push({ ...(d.data() as WebsiteUpdate), id: d.id });
        });

        // Sort descending
        list.sort(
          (a, b) =>
            new Date(b.releasedAt).getTime() - new Date(a.releasedAt).getTime()
        );

        setUpdates(list);
        setLoading(false);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, "websiteUpdates");
      }
    );
    return unsub;
  }, []);

  // Pre-fill form for editing
  const handleEdit = (u: WebsiteUpdate) => {
    setEditingUpdate(u);
    setTitle(u.title);
    setDescription(u.description);
    setCategory(u.category);
    setVersion(u.version);
    setVisibility(u.visibility);
    setIsPinned(u.isPinned || false);
    setDetailedNotes(u.detailedNotes || "");

    // Convert ISO releasedAt string to date-time-local value
    if (u.releasedAt) {
      try {
        const date = new Date(u.releasedAt);
        // adjust for timezone offset to build local format YYYY-MM-DDTHH:MM
        const tzOffset = date.getTimezoneOffset() * 60000;
        const localISOTime = new Date(date.getTime() - tzOffset)
          .toISOString()
          .slice(0, 16);
        setReleasedAt(localISOTime);
      } catch (err) {
        setReleasedAt("");
      }
    } else {
      setReleasedAt("");
    }

    setIsFormOpen(true);
  };

  const handleOpenNew = () => {
    setEditingUpdate(null);
    setTitle("");
    setDescription("");
    setCategory("New Features");
    setVersion("v1.0.0");
    setVisibility("all");
    setIsPinned(false);
    setDetailedNotes("");

    // Set default release date/time to now (local format)
    const now = new Date();
    const tzOffset = now.getTimezoneOffset() * 60000;
    const localISOTime = new Date(now.getTime() - tzOffset)
      .toISOString()
      .slice(0, 16);
    setReleasedAt(localISOTime);

    setIsFormOpen(true);
  };

  // Submit Handler
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim() || !description.trim() || !version.trim() || !releasedAt) {
      alert("Please fill in all required fields.");
      return;
    }

    const isoReleasedAt = new Date(releasedAt).toISOString();
    const updateId = editingUpdate?.id || `update_${Date.now()}`;

    const payload: Omit<WebsiteUpdate, "id"> = {
      title: title.trim(),
      description: description.trim(),
      category,
      version: version.trim(),
      visibility,
      releasedAt: isoReleasedAt,
      detailedNotes: detailedNotes.trim() || undefined,
      isPinned,
      viewsCount: editingUpdate ? editingUpdate.viewsCount || 0 : 0,
      createdBy: adminEmail || "angeloperfecto31@gmail.com",
      createdAt: editingUpdate
        ? editingUpdate.createdAt || new Date().toISOString()
        : new Date().toISOString(),
    };

    const path = `websiteUpdates/${updateId}`;
    try {
      await setDoc(doc(db, "websiteUpdates", updateId), payload);
      setIsFormOpen(false);
      setEditingUpdate(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, path);
    }
  };

  // Delete Handler
  const handleDelete = async (updateId: string) => {
    if (!window.confirm("Are you sure you want to delete this website update? This cannot be undone.")) {
      return;
    }

    const path = `websiteUpdates/${updateId}`;
    try {
      await deleteDoc(doc(db, "websiteUpdates", updateId));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, path);
    }
  };

  const getCategoryStyles = (cat: UpdateCategory) => {
    switch (cat) {
      case "New Features":
        return "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400";
      case "Improvements":
        return "bg-sky-500/10 text-sky-600 dark:text-sky-400";
      case "Bug Fixes":
        return "bg-rose-500/10 text-rose-600 dark:text-rose-400";
      case "Maintenance":
        return "bg-amber-500/10 text-amber-600 dark:text-amber-400";
      case "Security Updates":
        return "bg-purple-500/10 text-purple-600 dark:text-purple-400";
      default:
        return "bg-slate-500/10 text-slate-600 dark:text-slate-400";
    }
  };

  if (loading) {
    return <div className="p-8 text-center">Loading update management...</div>;
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto py-6 px-4 font-sans">
      {/* Header section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-5">
        <div className="space-y-1">
          <h2 className="text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2">
            <Shield className="w-6 h-6 text-emerald-500" />
            Website Update Announcements & Release Notes
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
            Publish system-wide notifications, features, bug fixes, improvements, and schedule upcoming announcements.
          </p>
        </div>
        <button
          onClick={handleOpenNew}
          className="flex items-center gap-1.5 px-4 py-2.5 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-xs font-black uppercase tracking-widest rounded-xl hover:opacity-95 transition-all shadow-md cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Publish Update</span>
        </button>
      </div>

      {/* Editor Modal Drawer / Panel */}
      <AnimatePresence>
        {isFormOpen && (
          <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]"
            >
              <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-950/15">
                <div className="flex items-center gap-2">
                  <Bell className="w-5 h-5 text-emerald-500" />
                  <h3 className="font-black text-md text-slate-900 dark:text-white uppercase tracking-wider">
                    {editingUpdate ? "Edit Update Details" : "Draft New Update"}
                  </h3>
                </div>
                <button
                  onClick={() => setIsFormOpen(false)}
                  className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-white"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              {/* Form container */}
              <form
                onSubmit={handleSubmit}
                className="p-6 overflow-y-auto space-y-4 flex-1 text-xs"
              >
                {/* Title */}
                <div className="space-y-1.5">
                  <label className="font-black text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                    Title *
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={200}
                    placeholder="Enter short, descriptive title (e.g. Electrical Pole Upgrade)"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 rounded-xl text-slate-900 dark:text-white font-medium focus:ring-1 focus:ring-emerald-500"
                  />
                </div>

                {/* Description */}
                <div className="space-y-1.5">
                  <label className="font-black text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                    Short Summary * (Max 500 chars)
                  </label>
                  <textarea
                    required
                    maxLength={500}
                    placeholder="Briefly describe what this update brings to the system..."
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={2}
                    className="w-full px-3 py-2 border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 rounded-xl text-slate-900 dark:text-white font-medium focus:ring-1 focus:ring-emerald-500"
                  />
                </div>

                {/* Grid fields */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Category */}
                  <div className="space-y-1.5">
                    <label className="font-black text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                      Category
                    </label>
                    <select
                      value={category}
                      onChange={(e) =>
                        setCategory(e.target.value as UpdateCategory)
                      }
                      className="w-full px-3 py-2 border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 rounded-xl text-slate-900 dark:text-white font-bold"
                    >
                      {categories.map((cat) => (
                        <option key={cat} value={cat}>
                          {cat}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Version Number */}
                  <div className="space-y-1.5">
                    <label className="font-black text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                      Version Number *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. v2.1.0"
                      value={version}
                      onChange={(e) => setVersion(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 rounded-xl text-slate-900 dark:text-white font-bold"
                    />
                  </div>

                  {/* Visibility Target */}
                  <div className="space-y-1.5">
                    <label className="font-black text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                      Target Audience
                    </label>
                    <select
                      value={visibility}
                      onChange={(e) =>
                        setVisibility(e.target.value as UpdateVisibility)
                      }
                      className="w-full px-3 py-2 border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 rounded-xl text-slate-900 dark:text-white font-bold"
                    >
                      <option value="all">All Users</option>
                      <option value="premium">Premium Users Only</option>
                      <option value="basic">Basic Users Only</option>
                    </select>
                  </div>
                </div>

                {/* Scheduled Release Date & Pinned announcement check */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Datepicker */}
                  <div className="space-y-1.5">
                    <label className="font-black text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" />
                      <span>Release Date-Time *</span>
                    </label>
                    <input
                      type="datetime-local"
                      required
                      value={releasedAt}
                      onChange={(e) => setReleasedAt(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 rounded-xl text-slate-900 dark:text-white font-bold"
                    />
                    <span className="text-[10px] text-slate-400 font-medium leading-none block">
                      Setting a future date-time will automatically schedule the
                      notification announcement.
                    </span>
                  </div>

                  {/* Pin check */}
                  <div className="flex items-center gap-2 border border-slate-100 dark:border-slate-850 p-3 rounded-2xl self-center bg-slate-50/40 dark:bg-slate-950/20">
                    <input
                      type="checkbox"
                      id="isPinned"
                      checked={isPinned}
                      onChange={(e) => setIsPinned(e.target.checked)}
                      className="h-4 w-4 rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                    />
                    <label
                      htmlFor="isPinned"
                      className="font-black text-slate-700 dark:text-slate-300 uppercase tracking-wider cursor-pointer select-none"
                    >
                      Pin Important Announcement to Top
                    </label>
                  </div>
                </div>

                {/* Detailed release notes (Optional) */}
                <div className="space-y-1.5">
                  <label className="font-black text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1">
                    <FileText className="w-3.5 h-3.5" />
                    <span>Detailed Release Notes (Optional)</span>
                  </label>
                  <textarea
                    placeholder="Provide long release details, features lists, bug fixes details, or troubleshooting suggestions here..."
                    value={detailedNotes}
                    onChange={(e) => setDetailedNotes(e.target.value)}
                    rows={5}
                    className="w-full px-3 py-2 border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 rounded-xl text-slate-900 dark:text-white font-medium focus:ring-1 focus:ring-emerald-500 font-sans"
                  />
                </div>

                {/* Buttons */}
                <div className="flex gap-3 pt-4 border-t border-slate-150 dark:border-slate-850">
                  <button
                    type="button"
                    onClick={() => setIsFormOpen(false)}
                    className="flex-1 py-3 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 font-black uppercase tracking-wider rounded-2xl cursor-pointer transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-3 bg-slate-900 hover:bg-slate-850 dark:bg-slate-100 dark:hover:bg-white text-white dark:text-slate-900 font-black uppercase tracking-wider rounded-2xl shadow-lg cursor-pointer transition-all"
                  >
                    {editingUpdate ? "Save Changes" : "Publish Update Now"}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Announcements list table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800/85 rounded-3xl overflow-hidden shadow-sm">
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/45 dark:bg-slate-950/10">
          <h3 className="font-black text-slate-800 dark:text-slate-200 text-xs uppercase tracking-wider flex items-center gap-1.5">
            <Layers className="w-4 h-4 text-slate-500" />
            <span>Currently Published Announcements ({updates.length})</span>
          </h3>
        </div>

        {updates.length === 0 ? (
          <div className="py-16 text-center text-slate-500">
            No updates have been drafted or published yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs text-slate-600 dark:text-slate-400">
              <thead className="bg-slate-50/60 dark:bg-slate-950/20 text-slate-400 dark:text-slate-500 font-black uppercase tracking-wider text-[10px] border-b border-slate-100 dark:border-slate-800">
                <tr>
                  <th className="px-6 py-3">Version & Category</th>
                  <th className="px-6 py-3">Title & Summary</th>
                  <th className="px-6 py-3">Audience</th>
                  <th className="px-6 py-3">Views Count</th>
                  <th className="px-6 py-3">Status / Released At</th>
                  <th className="px-6 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-850">
                {updates.map((u) => {
                  const now = new Date();
                  const releaseDate = new Date(u.releasedAt);
                  const isScheduled = releaseDate > now;

                  return (
                    <tr
                      key={u.id}
                      className="hover:bg-slate-50/50 dark:hover:bg-slate-950/25 transition-colors"
                    >
                      {/* Version & Category */}
                      <td className="px-6 py-4 space-y-1">
                        <div className="flex items-center gap-1.5">
                          {u.isPinned && (
                            <span className="text-[8px] bg-rose-500 text-white px-1 rounded font-black">
                              PIN
                            </span>
                          )}
                          <span className="font-mono font-black text-slate-900 dark:text-white bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded text-[10px]">
                            {u.version}
                          </span>
                        </div>
                        <span
                          className={`text-[9px] font-bold px-2 py-0.5 rounded-full inline-block ${getCategoryStyles(
                            u.category
                          )}`}
                        >
                          {u.category}
                        </span>
                      </td>

                      {/* Title & Summary */}
                      <td className="px-6 py-4 max-w-[320px]">
                        <div className="font-bold text-slate-900 dark:text-white text-sm truncate">
                          {u.title}
                        </div>
                        <div className="text-slate-500 text-xxs leading-relaxed line-clamp-2">
                          {u.description}
                        </div>
                      </td>

                      {/* Target Audience */}
                      <td className="px-6 py-4 font-bold uppercase tracking-wider text-[9px]">
                        {u.visibility === "all" && (
                          <span className="text-slate-600 dark:text-slate-400">
                            ALL USERS
                          </span>
                        )}
                        {u.visibility === "premium" && (
                          <span className="text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded-full">
                            PREMIUM ONLY
                          </span>
                        )}
                        {u.visibility === "basic" && (
                          <span className="text-indigo-500 bg-indigo-500/10 px-2 py-0.5 rounded-full">
                            BASIC ONLY
                          </span>
                        )}
                      </td>

                      {/* Track Views */}
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-1 font-bold text-indigo-600 dark:text-indigo-400 font-mono">
                          <Eye className="w-3.5 h-3.5" />
                          <span>{u.viewsCount || 0}</span>
                        </div>
                      </td>

                      {/* Status / Scheduled */}
                      <td className="px-6 py-4 space-y-1 font-medium">
                        <div className="flex items-center gap-1 text-[10px]">
                          {isScheduled ? (
                            <span className="text-amber-500 bg-amber-500/10 px-1.5 py-0.2 rounded flex items-center gap-0.5 font-bold">
                              <Clock className="w-3 h-3" /> Scheduled
                            </span>
                          ) : (
                            <span className="text-emerald-500 bg-emerald-500/10 px-1.5 py-0.2 rounded flex items-center gap-0.5 font-bold">
                              <CheckCircle className="w-3 h-3" /> Active
                            </span>
                          )}
                        </div>
                        <div className="text-slate-400 text-xxs font-mono">
                          {new Date(u.releasedAt).toLocaleString()}
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleEdit(u)}
                            className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-slate-800 dark:hover:text-white rounded-lg transition-colors cursor-pointer"
                            title="Edit"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(u.id)}
                            className="p-1.5 hover:bg-rose-50 dark:hover:bg-rose-950/20 text-slate-400 hover:text-rose-600 rounded-lg transition-colors cursor-pointer"
                            title="Delete"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
