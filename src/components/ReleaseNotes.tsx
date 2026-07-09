import React, { useState, useEffect } from "react";
import {
  collection,
  onSnapshot,
  doc,
  setDoc,
  updateDoc,
  increment,
  query,
} from "firebase/firestore";
import { db } from "../firebase";
import {
  Calendar,
  Layers,
  Search,
  Tag,
  CheckCircle,
  Pin,
  ChevronDown,
  ChevronUp,
  Eye,
  ArrowLeft,
  Settings,
  Sparkles,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import {
  handleFirestoreError,
  OperationType,
} from "../utils/firestoreError";
import { WebsiteUpdate, UpdateCategory } from "../types/updates";

interface Props {
  user: any;
  userPlan: string | null;
  isAdmin: boolean;
  onBackToDashboard: () => void;
}

export const ReleaseNotes: React.FC<Props> = ({
  user,
  userPlan,
  isAdmin,
  onBackToDashboard,
}) => {
  const [updates, setUpdates] = useState<WebsiteUpdate[]>([]);
  const [readStates, setReadStates] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("All");
  const [expandedUpdateId, setExpandedUpdateId] = useState<string | null>(null);

  const categories: string[] = [
    "All",
    "New Features",
    "Improvements",
    "Bug Fixes",
    "Maintenance",
    "Security Updates",
    "General Announcements",
  ];

  // 1. Fetch updates
  useEffect(() => {
    const q = query(collection(db, "websiteUpdates"));
    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const list: WebsiteUpdate[] = [];
        const now = new Date().toISOString();

        snapshot.forEach((d) => {
          const data = d.data() as WebsiteUpdate;
          const u = { ...data, id: d.id };

          // Only display released updates (unless user is admin)
          if (isAdmin || (u.releasedAt && u.releasedAt <= now)) {
            // Check visibility matches user plan
            const matchesVisibility =
              isAdmin ||
              u.visibility === "all" ||
              (u.visibility === "premium" &&
                (userPlan === "premium" || userPlan === "enterprise")) ||
              (u.visibility === "basic" && userPlan === "basic");

            if (matchesVisibility) {
              list.push(u);
            }
          }
        });

        // Sort: Pin to top first, then releasedAt desc
        list.sort((a, b) => {
          if (a.isPinned && !b.isPinned) return -1;
          if (!a.isPinned && b.isPinned) return 1;
          return (
            new Date(b.releasedAt).getTime() - new Date(a.releasedAt).getTime()
          );
        });

        setUpdates(list);
        setLoading(false);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, "websiteUpdates");
      }
    );
    return unsub;
  }, [userPlan, isAdmin]);

  // 2. Fetch read states
  useEffect(() => {
    if (!user) return;

    const path = `users/${user.uid}/updateStates`;
    const unsub = onSnapshot(
      collection(db, path),
      (snapshot) => {
        const states: Record<string, boolean> = {};
        snapshot.forEach((doc) => {
          states[doc.id] = doc.data().read || false;
        });
        setReadStates(states);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, path);
      }
    );
    return unsub;
  }, [user]);

  // Handle Mark as Read on expand
  const handleToggleExpand = async (updateId: string) => {
    if (expandedUpdateId === updateId) {
      setExpandedUpdateId(null);
    } else {
      setExpandedUpdateId(updateId);

      // Automatically mark as read if logged in and not already read
      if (user && !readStates[updateId]) {
        const path = `users/${user.uid}/updateStates/${updateId}`;
        try {
          await setDoc(doc(db, `users/${user.uid}/updateStates`, updateId), {
            updateId,
            read: true,
            readAt: new Date().toISOString(),
          });

          await updateDoc(doc(db, "websiteUpdates", updateId), {
            viewsCount: increment(1),
          });
        } catch (err) {
          handleFirestoreError(err, OperationType.WRITE, path);
        }
      }
    }
  };

  // Filter lists
  const filtered = updates.filter((u) => {
    const matchesCategory =
      selectedCategory === "All" || u.category === selectedCategory;
    const matchesSearch =
      u.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.version.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (u.detailedNotes &&
        u.detailedNotes.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesCategory && matchesSearch;
  });

  const getCategoryStyles = (cat: UpdateCategory) => {
    switch (cat) {
      case "New Features":
        return "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20";
      case "Improvements":
        return "bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20";
      case "Bug Fixes":
        return "bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20";
      case "Maintenance":
        return "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20";
      case "Security Updates":
        return "bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20";
      default:
        return "bg-slate-500/10 text-slate-600 dark:text-slate-400 border border-slate-500/20";
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent"></div>
        <p className="text-sm text-slate-500 mt-4 font-bold">
          Loading Release Notes...
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto py-4 px-2 space-y-8 font-sans">
      {/* Header section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-6">
        <div className="space-y-1.5">
          <button
            onClick={onBackToDashboard}
            className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800 dark:hover:text-white font-black uppercase tracking-wider cursor-pointer mb-2 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Dashboard</span>
          </button>
          <div className="flex items-center gap-2.5">
            <Sparkles className="w-6 h-6 text-emerald-500" />
            <h1 className="text-3xl font-black tracking-tight text-slate-900 dark:text-white">
              WHAT'S NEW & RELEASE NOTES
            </h1>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">
            Stay up to date with new feature developments, calculation engines,
            bug fixes, and improvements.
          </p>
        </div>
      </div>

      {/* Main Content & Sidebar layout */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* Left Sidebar filters */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-slate-50/70 dark:bg-slate-900/50 border border-slate-200/60 dark:border-slate-800 p-5 rounded-2xl space-y-5">
            <div>
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-3.5">
                Search Releases
              </h3>
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Type to search..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-xs bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500"
                />
              </div>
            </div>

            <div>
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-3 flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5" />
                <span>Filter Categories</span>
              </h3>
              <div className="flex flex-col gap-1.5">
                {categories.map((cat) => {
                  const count =
                    cat === "All"
                      ? updates.length
                      : updates.filter((u) => u.category === cat).length;

                  return (
                    <button
                      key={cat}
                      onClick={() => setSelectedCategory(cat)}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold transition-all border cursor-pointer ${
                        selectedCategory === cat
                          ? "bg-slate-900 border-slate-900 text-white dark:bg-slate-100 dark:border-slate-100 dark:text-slate-900 shadow-sm"
                          : "bg-white dark:bg-slate-950 hover:bg-slate-50 dark:hover:bg-slate-900 border-slate-200 dark:border-slate-850 text-slate-600 dark:text-slate-400"
                      }`}
                    >
                      <span>{cat}</span>
                      <span className="text-[10px] font-bold opacity-60">
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Notes Stream / Feed */}
        <div className="lg:col-span-3 space-y-6">
          {filtered.length === 0 ? (
            <div className="text-center py-24 bg-slate-50/30 dark:bg-slate-950/20 border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl">
              <Calendar className="w-10 h-10 mx-auto text-slate-300 dark:text-slate-700 mb-3" />
              <p className="text-sm font-bold text-slate-600 dark:text-slate-400">
                No updates matched your search filters.
              </p>
              <button
                onClick={() => {
                  setSearchQuery("");
                  setSelectedCategory("All");
                }}
                className="mt-4 px-4 py-2 bg-slate-100 dark:bg-slate-800 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-250 cursor-pointer"
              >
                Clear Filters
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              {filtered.map((u) => {
                const isExpanded = expandedUpdateId === u.id;
                const isRead = readStates[u.id] || false;

                return (
                  <motion.div
                    key={u.id}
                    layout="position"
                    className={`bg-white dark:bg-slate-900 border ${
                      u.isPinned
                        ? "border-rose-300/60 dark:border-rose-900/40 shadow-sm shadow-rose-500/[0.02]"
                        : "border-slate-200/70 dark:border-slate-800/80"
                    } rounded-3xl overflow-hidden transition-all duration-200 hover:shadow-md`}
                  >
                    {/* Header banner/strip for pinned announcements */}
                    {u.isPinned && (
                      <div className="bg-rose-500/10 px-6 py-2 border-b border-rose-500/10 flex items-center gap-1.5 text-rose-600 dark:text-rose-400 text-xxs font-black tracking-wider uppercase">
                        <Pin className="w-3.5 h-3.5 fill-rose-500 animate-pulse" />
                        <span>Pinned Update / Important Announcement</span>
                      </div>
                    )}

                    <div className="p-6 md:p-8 space-y-4">
                      {/* Subtitle meta details */}
                      <div className="flex flex-wrap items-center gap-2 md:gap-3">
                        <span
                          className={`text-[9px] px-2.5 py-0.5 rounded-full font-extrabold flex items-center gap-1 ${getCategoryStyles(
                            u.category
                          )}`}
                        >
                          <Tag className="w-2.5 h-2.5" />
                          {u.category}
                        </span>

                        <span className="text-xs text-slate-400 dark:text-slate-500 font-bold bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-lg font-mono">
                          {u.version}
                        </span>

                        <span className="text-xs text-slate-400 dark:text-slate-500 flex items-center gap-1 font-semibold">
                          <Calendar className="w-3.5 h-3.5" />
                          {u.releasedAt
                            ? new Date(u.releasedAt).toLocaleDateString(
                                "en-US",
                                {
                                  year: "numeric",
                                  month: "long",
                                  day: "numeric",
                                }
                              )
                            : ""}
                        </span>

                        {isAdmin && (
                          <span className="text-xs text-indigo-400 flex items-center gap-1 font-mono">
                            <Eye className="w-3.5 h-3.5" />
                            {u.viewsCount || 0} views
                          </span>
                        )}

                        {user && !isRead && (
                          <span className="text-[10px] bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 px-2 py-0.5 rounded-full font-black tracking-wide uppercase flex items-center gap-1">
                            <span className="w-1 h-1 rounded-full bg-emerald-500" />
                            New
                          </span>
                        )}
                      </div>

                      {/* Title & Description */}
                      <div className="space-y-1.5">
                        <h2 className="text-xl md:text-2xl font-black text-slate-900 dark:text-white leading-tight">
                          {u.title}
                        </h2>
                        <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                          {u.description}
                        </p>
                      </div>

                      {/* Detailed release notes collapsible toggle */}
                      {u.detailedNotes && (
                        <div className="border-t border-slate-100 dark:border-slate-850 pt-4 mt-2">
                          <button
                            onClick={() => handleToggleExpand(u.id)}
                            className="flex items-center gap-1 text-xs text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 font-black uppercase tracking-wider cursor-pointer"
                          >
                            <span>
                              {isExpanded
                                ? "Collapse Detailed Notes"
                                : "Read Detailed Release Notes"}
                            </span>
                            {isExpanded ? (
                              <ChevronUp className="w-4 h-4" />
                            ) : (
                              <ChevronDown className="w-4 h-4" />
                            )}
                          </button>

                          <AnimatePresence>
                            {isExpanded && (
                              <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: "auto" }}
                                exit={{ opacity: 0, height: 0 }}
                                transition={{ duration: 0.2 }}
                                className="overflow-hidden"
                              >
                                <div className="mt-4 p-5 md:p-6 bg-slate-50 dark:bg-slate-950/45 border border-slate-100 dark:border-slate-850 rounded-2xl text-xs md:text-sm text-slate-700 dark:text-slate-300 space-y-3 leading-relaxed whitespace-pre-wrap font-sans">
                                  {u.detailedNotes}
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
