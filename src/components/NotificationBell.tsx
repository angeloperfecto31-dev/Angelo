import React, { useState, useEffect, useRef } from "react";
import {
  collection,
  onSnapshot,
  doc,
  setDoc,
  getDoc,
  increment,
  updateDoc,
  query,
  where,
} from "firebase/firestore";
import { db } from "../firebase";
import {
  Bell,
  Check,
  CheckSquare,
  Search,
  SlidersHorizontal,
  X,
  Volume2,
  ExternalLink,
  ChevronRight,
  Info,
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
  onViewAllPastUpdates: () => void;
}

export const NotificationBell: React.FC<Props> = ({
  user,
  userPlan,
  isAdmin,
  onViewAllPastUpdates,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [updates, setUpdates] = useState<WebsiteUpdate[]>([]);
  const [readStates, setReadStates] = useState<Record<string, boolean>>({});
  const [selectedCategory, setSelectedCategory] = useState<string>("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [showToast, setShowToast] = useState<WebsiteUpdate | null>(null);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Keep track of the first snapshot to prevent toast on initial load
  const isInitialLoad = useRef(true);
  const lastActiveUser = useRef<string | null>(null);

  // Categories list
  const categories: string[] = [
    "All",
    "New Features",
    "Improvements",
    "Bug Fixes",
    "Maintenance",
    "Security Updates",
    "General Announcements",
  ];

  // 1. Listen for Updates
  useEffect(() => {
    // Standard real-time listener for updates
    const updatesQuery = query(collection(db, "websiteUpdates"));

    const unsubUpdates = onSnapshot(
      updatesQuery,
      (snapshot) => {
        const list: WebsiteUpdate[] = [];
        const now = new Date().toISOString();

        snapshot.forEach((d) => {
          const data = d.data() as WebsiteUpdate;
          const updateId = d.id;
          const u = { ...data, id: updateId };

          // Only display updates that have been released (scheduled in the past or now)
          // Unless the user is an admin, who should see all announcements
          if (isAdmin || (u.releasedAt && u.releasedAt <= now)) {
            // Check visibility matches user account type
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

        // Sort: Pinned first, then releasedAt descending
        list.sort((a, b) => {
          if (a.isPinned && !b.isPinned) return -1;
          if (!a.isPinned && b.isPinned) return 1;
          return (
            new Date(b.releasedAt).getTime() - new Date(a.releasedAt).getTime()
          );
        });

        // Detect if a brand new update was released in this session
        if (!isInitialLoad.current && list.length > updates.length) {
          const currentIds = new Set(updates.map((item) => item.id));
          const brandNew = list.find((item) => !currentIds.has(item.id));
          if (brandNew && !brandNew.isPinned) {
            // Trigger a beautiful sliding session toast!
            setShowToast(brandNew);
            // Auto hide toast after 6s
            setTimeout(() => setShowToast(null), 6000);
          }
        }

        setUpdates(list);
        isInitialLoad.current = false;
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, "websiteUpdates");
      }
    );

    return unsubUpdates;
  }, [userPlan, isAdmin]);

  // 2. Listen for User's Read State
  useEffect(() => {
    if (!user) {
      setReadStates({});
      setShowLoginModal(false);
      lastActiveUser.current = null;
      return;
    }

    const path = `users/${user.uid}/updateStates`;
    const unsubReadStates = onSnapshot(
      collection(db, path),
      (snapshot) => {
        const states: Record<string, boolean> = {};
        snapshot.forEach((doc) => {
          states[doc.id] = doc.data().read || false;
        });
        setReadStates(states);

        // Notify user immediately after logging in if a new update is available
        // We only trigger this once per login session
        if (lastActiveUser.current !== user.uid && updates.length > 0) {
          lastActiveUser.current = user.uid;
          // Check if there are any unread active updates
          const unreadCount = updates.filter(
            (u) => !states[u.id] && (!u.isPinned || true)
          ).length;
          if (unreadCount > 0) {
            setShowLoginModal(true);
          }
        }
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, path);
      }
    );

    return unsubReadStates;
  }, [user, updates]);

  // Handle clicking outside dropdown to close
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Filter & Search calculations
  const filteredUpdates = updates.filter((u) => {
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

  const unreadCount = updates.filter((u) => !readStates[u.id]).length;

  // Mark single update as read
  const handleMarkAsRead = async (updateId: string) => {
    if (!user) return;

    const path = `users/${user.uid}/updateStates/${updateId}`;
    try {
      // 1. Save read state
      await setDoc(doc(db, `users/${user.uid}/updateStates`, updateId), {
        updateId,
        read: true,
        readAt: new Date().toISOString(),
      });

      // 2. Increment parent viewsCount if it wasn't read before
      if (!readStates[updateId]) {
        await updateDoc(doc(db, "websiteUpdates", updateId), {
          viewsCount: increment(1),
        });
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, path);
    }
  };

  // Mark all visible updates as read
  const handleMarkAllAsRead = async () => {
    if (!user || filteredUpdates.length === 0) return;

    const promises = filteredUpdates
      .filter((u) => !readStates[u.id])
      .map(async (u) => {
        const path = `users/${user.uid}/updateStates/${u.id}`;
        try {
          await setDoc(doc(db, `users/${user.uid}/updateStates`, u.id), {
            updateId: u.id,
            read: true,
            readAt: new Date().toISOString(),
          });

          await updateDoc(doc(db, "websiteUpdates", u.id), {
            viewsCount: increment(1),
          });
        } catch (err) {
          handleFirestoreError(err, OperationType.WRITE, path);
        }
      });

    await Promise.all(promises);
  };

  // Category chip styling
  const getCategoryColor = (cat: UpdateCategory) => {
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

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell Trigger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="p-1.5 relative bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg text-slate-600 dark:text-slate-300 transition-colors cursor-pointer"
        title="Website Updates"
      >
        <Bell className="w-4 h-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[9px] font-bold text-white shadow-sm ring-2 ring-white dark:ring-slate-900 animate-pulse">
            {unreadCount}
          </span>
        )}
      </button>

      {/* Notifications Dropdown Panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 mt-2.5 w-[360px] md:w-[420px] max-h-[580px] bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800/80 rounded-2xl shadow-xl z-50 flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="p-4 border-b border-slate-150 dark:border-slate-850 flex items-center justify-between bg-slate-50/55 dark:bg-slate-950/25">
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4 text-emerald-500" />
                <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                  System Notifications
                </h3>
                {unreadCount > 0 && (
                  <span className="text-xxs px-2 py-0.5 rounded-full bg-rose-100 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 font-extrabold">
                    {unreadCount} New
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                {unreadCount > 0 && user && (
                  <button
                    onClick={handleMarkAllAsRead}
                    className="flex items-center gap-1 text-[10px] text-slate-500 hover:text-emerald-500 dark:hover:text-emerald-400 font-semibold cursor-pointer py-1 px-2 rounded hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                    title="Mark all as read"
                  >
                    <CheckSquare className="w-3.5 h-3.5" />
                    <span>Mark all read</span>
                  </button>
                )}
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-1 hover:bg-slate-150 dark:hover:bg-slate-800 rounded-md text-slate-400 hover:text-slate-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Quick search & Filters */}
            <div className="p-3 bg-slate-50/50 dark:bg-slate-950/20 border-b border-slate-150 dark:border-slate-850 space-y-2.5">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search updates..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 text-xs bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-lg text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              {/* Categorization chips slider */}
              <div className="flex items-center gap-1 overflow-x-auto pb-1 scrollbar-thin">
                {categories.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap border cursor-pointer transition-all ${
                      selectedCategory === cat
                        ? "bg-emerald-500 border-emerald-500 text-white"
                        : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800"
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            {/* Scrollable Notification Stream */}
            <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-850 max-h-[380px] p-1.5 space-y-1">
              {filteredUpdates.length === 0 ? (
                <div className="py-12 text-center">
                  <Bell className="w-8 h-8 mx-auto text-slate-300 dark:text-slate-700 mb-2.5" />
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    No matching update notifications found.
                  </p>
                </div>
              ) : (
                filteredUpdates.map((u) => {
                  const isRead = readStates[u.id] || false;
                  return (
                    <div
                      key={u.id}
                      className={`p-3.5 rounded-xl transition-all relative ${
                        isRead
                          ? "bg-transparent opacity-80"
                          : "bg-emerald-500/[0.02] border border-emerald-500/10 shadow-sm"
                      } hover:bg-slate-50 dark:hover:bg-slate-850/40`}
                    >
                      {/* Unread Glowing Point indicator */}
                      {!isRead && (
                        <div className="absolute right-3.5 top-3.5 w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-sm shadow-emerald-500" />
                      )}

                      <div className="flex flex-col gap-1.5">
                        <div className="flex items-center flex-wrap gap-1.5">
                          {u.isPinned && (
                            <span className="text-[8px] bg-rose-500 text-white px-1.5 py-0.2 rounded font-black tracking-wider uppercase">
                              PINNED
                            </span>
                          )}
                          <span
                            className={`text-[8px] px-1.5 py-0.2 rounded font-extrabold ${getCategoryColor(
                              u.category
                            )}`}
                          >
                            {u.category}
                          </span>
                          <span className="text-[10px] text-slate-400 font-mono font-bold bg-slate-100 dark:bg-slate-800 px-1.5 py-0.2 rounded">
                            {u.version}
                          </span>
                        </div>

                        <h4 className="font-bold text-xs text-slate-950 dark:text-white leading-tight">
                          {u.title}
                        </h4>

                        <p className="text-xxs text-slate-600 dark:text-slate-400 leading-normal">
                          {u.description}
                        </p>

                        <div className="flex items-center justify-between pt-1 text-[9px] text-slate-400 dark:text-slate-500">
                          <span>
                            {u.releasedAt
                              ? new Date(u.releasedAt).toLocaleDateString(
                                  "en-US",
                                  {
                                    month: "short",
                                    day: "2-digit",
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  }
                                )
                              : ""}
                          </span>

                          <div className="flex items-center gap-2">
                            {user && !isRead && (
                              <button
                                onClick={() => handleMarkAsRead(u.id)}
                                className="flex items-center gap-0.5 text-emerald-600 dark:text-emerald-400 hover:underline font-extrabold cursor-pointer"
                              >
                                <Check className="w-3 h-3" />
                                <span>Mark read</span>
                              </button>
                            )}

                            {u.detailedNotes && (
                              <button
                                onClick={() => {
                                  setIsOpen(false);
                                  onViewAllPastUpdates();
                                }}
                                className="flex items-center gap-0.5 text-indigo-500 hover:underline font-bold cursor-pointer"
                              >
                                <span>Read More</span>
                                <ChevronRight className="w-2.5 h-2.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Footer */}
            <div className="p-3 border-t border-slate-150 dark:border-slate-850 bg-slate-50/60 dark:bg-slate-950/30 flex items-center justify-center">
              <button
                onClick={() => {
                  setIsOpen(false);
                  onViewAllPastUpdates();
                }}
                className="w-full py-2 bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:hover:bg-white text-white dark:text-slate-900 rounded-xl text-xxs font-extrabold uppercase tracking-widest transition-all duration-200 shadow-md flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <span>View Complete Update History</span>
                <ExternalLink className="w-3 h-3" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Real-Time Session Toasts (Sliding notification) */}
      <AnimatePresence>
        {showToast && (
          <motion.div
            initial={{ opacity: 0, x: 100, y: 100 }}
            animate={{ opacity: 1, x: 0, y: 0 }}
            exit={{ opacity: 0, x: 100 }}
            className="fixed bottom-6 right-6 w-[340px] bg-slate-900 border border-slate-850 p-4 rounded-2xl shadow-2xl z-50 flex gap-3 text-white overflow-hidden"
          >
            <div className="p-2 bg-emerald-500/10 rounded-xl self-start">
              <Volume2 className="w-5 h-5 text-emerald-400 animate-bounce" />
            </div>
            <div className="flex-1 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[9px] font-black uppercase text-emerald-400 tracking-wider">
                  📢 New Release: {showToast.version}
                </span>
                <button
                  onClick={() => setShowToast(null)}
                  className="text-slate-400 hover:text-white"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <h4 className="font-bold text-xs">{showToast.title}</h4>
              <p className="text-xxs text-slate-300 leading-normal">
                {showToast.description}
              </p>
              <div className="flex items-center gap-3 pt-1">
                <button
                  onClick={() => {
                    setShowToast(null);
                    if (user) handleMarkAsRead(showToast.id);
                    onViewAllPastUpdates();
                  }}
                  className="text-[10px] font-extrabold text-yellow-300 hover:underline cursor-pointer"
                >
                  Details
                </button>
                <button
                  onClick={() => {
                    if (user) handleMarkAsRead(showToast.id);
                    setShowToast(null);
                  }}
                  className="text-[10px] font-medium text-slate-400 hover:text-white cursor-pointer"
                >
                  Dismiss
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Welcoming Update Announcement Popup on Login */}
      <AnimatePresence>
        {showLoginModal && (
          <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-850 rounded-3xl max-w-lg w-full overflow-hidden shadow-2xl flex flex-col"
            >
              <div className="p-6 bg-gradient-to-br from-indigo-900 via-slate-900 to-slate-950 text-white relative">
                <button
                  onClick={() => setShowLoginModal(false)}
                  className="absolute top-4 right-4 p-1 rounded-full bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
                <div className="flex items-center gap-2 mb-2">
                  <div className="p-1.5 bg-yellow-400 rounded-lg text-slate-950">
                    <Bell className="w-4 h-4 animate-swing" />
                  </div>
                  <span className="text-[10px] font-black uppercase text-yellow-300 tracking-wider">
                    Whats New
                  </span>
                </div>
                <h3 className="text-2xl font-black uppercase tracking-tight">
                  Website Updates Released!
                </h3>
                <p className="text-slate-300 text-xs mt-1">
                  We have added new features and calculations. Take a look at
                  what’s updated!
                </p>
              </div>

              <div className="p-6 overflow-y-auto max-h-[300px] divide-y divide-slate-100 dark:divide-slate-850">
                {updates.slice(0, 3).map((u) => (
                  <div key={u.id} className="py-4 first:pt-0 last:pb-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className={`text-[8px] px-2 py-0.2 rounded font-extrabold ${getCategoryColor(
                          u.category
                        )}`}
                      >
                        {u.category}
                      </span>
                      <span className="text-[9px] font-mono text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 rounded font-bold">
                        {u.version}
                      </span>
                    </div>
                    <h4 className="font-bold text-sm text-slate-900 dark:text-white">
                      {u.title}
                    </h4>
                    <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 leading-normal">
                      {u.description}
                    </p>
                  </div>
                ))}
              </div>

              <div className="p-6 border-t border-slate-100 dark:border-slate-850 bg-slate-50 dark:bg-slate-950/20 flex gap-3">
                <button
                  onClick={async () => {
                    setShowLoginModal(false);
                    // Mark all loaded updates as read
                    const promises = updates.map(async (u) => {
                      try {
                        await setDoc(
                          doc(db, `users/${user.uid}/updateStates`, u.id),
                          {
                            updateId: u.id,
                            read: true,
                            readAt: new Date().toISOString(),
                          }
                        );
                        if (!readStates[u.id]) {
                          await updateDoc(doc(db, "websiteUpdates", u.id), {
                            viewsCount: increment(1),
                          });
                        }
                      } catch (err) {
                        // safe capture
                      }
                    });
                    await Promise.all(promises);
                  }}
                  className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-black uppercase tracking-wider rounded-2xl cursor-pointer transition-all"
                >
                  Got it, Dismiss
                </button>
                <button
                  onClick={async () => {
                    setShowLoginModal(false);
                    onViewAllPastUpdates();
                  }}
                  className="flex-1 py-3 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white text-xs font-black uppercase tracking-wider rounded-2xl shadow-lg shadow-emerald-500/10 cursor-pointer transition-all flex items-center justify-center gap-1.5"
                >
                  <span>Explore History</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
