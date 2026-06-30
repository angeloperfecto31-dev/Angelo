import React, { useState, useEffect } from 'react';
import { collection, doc, setDoc, onSnapshot, addDoc } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { 
  Users, CheckCircle2, AlertCircle, CalendarRange, 
  Search, Filter, ShieldCheck, X 
} from 'lucide-react';
import { handleFirestoreError, OperationType } from '../utils/firestoreError';

export default function SubscriptionManager() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [planFilter, setPlanFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [targetUsers, setTargetUsers] = useState<any[]>([]);
  const [editPlan, setEditPlan] = useState("");
  const [editStatus, setEditStatus] = useState("");
  const [editExpiresAt, setEditExpiresAt] = useState("");
  const [editIsLifetime, setEditIsLifetime] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, "users"), (snapshot) => {
      const list: any[] = [];
      snapshot.forEach((snapDoc) => {
        list.push({ uid: snapDoc.id, ...snapDoc.data() });
      });
      setUsers(list);
      setLoading(false);
    }, (error) => {
      console.error(error);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const openEditModal = (u: any) => {
    setTargetUsers([u]);
    setEditPlan(u.plan || u.plan_name || (u.isActive ? "premium" : "basic"));
    setEditStatus(u.status || (u.isActive ? "Active" : "Expired"));
    setEditExpiresAt(u.expiresAt || u.expires_at || "");
    setEditIsLifetime(u.is_lifetime || false);
    setMessage("");
  };

  const openBulkEditModal = () => {
    const selected = users.filter(u => selectedUsers.includes(u.uid));
    setTargetUsers(selected);
    setEditPlan("premium");
    setEditStatus("Active");
    setEditExpiresAt("");
    setEditIsLifetime(false);
    setMessage("");
  };

  useEffect(() => {
    if (editPlan === "enterprise") {
      setEditIsLifetime(true);
      setEditExpiresAt("");
      setEditStatus("Active");
    }
  }, [editPlan]);

  const handleSaveSubscription = async () => {
    if (targetUsers.length === 0) return;
    setSaving(true);
    setMessage("");

    const updateData: any = {
      plan: editPlan,
      plan_name: editPlan,
      subscription_type: editIsLifetime ? "Lifetime" : "Standard",
      is_lifetime: editIsLifetime,
      status: editStatus,
      expires_at: editIsLifetime ? null : (editExpiresAt || null),
      expiresAt: editIsLifetime ? null : (editExpiresAt || null),
      upgraded_by_admin: true,
      last_modified_by: "Admin",
      modified_at: new Date().toISOString(),
      isActive: editStatus === "Active" || editStatus === "active",
      paymentStatus: editStatus === "Active" || editStatus === "active" ? "paid" : "unpaid"
    };

    try {
      for (const targetUser of targetUsers) {
        await setDoc(doc(db, "users", targetUser.uid), updateData, { merge: true });
        
        try {
          await addDoc(collection(db, "admin_activity_logs"), {
            action: "manual_subscription_update",
            adminEmail: auth.currentUser?.email || "Unknown Admin",
            timestamp: new Date().toISOString(),
            targetUserUid: targetUser.uid,
            targetUserEmail: targetUser.email,
            details: {
              previousPlan: targetUser.plan || "N/A",
              newPlan: editPlan,
              previousStatus: targetUser.status || "N/A",
              newStatus: editStatus,
              isLifetime: editIsLifetime,
              notes: targetUsers.length > 1 ? "Bulk administrator subscription adjustment." : "Manual administrator subscription adjustment."
            }
          });
        } catch (logErr) {
          console.warn("Failed to write to admin activity log:", logErr);
        }
      }

      setMessage(`Subscription updated successfully for ${targetUsers.length} user(s).`);
      setSelectedUsers([]);
      setTimeout(() => setTargetUsers([]), 1500);
    } catch (err: any) {
      setMessage("Error updating subscription: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const filteredUsers = users.filter(u => {
    const email = (u.email || "").toLowerCase();
    const name = (u.name || "").toLowerCase();
    const q = searchQuery.toLowerCase();
    if (q && !email.includes(q) && !name.includes(q)) return false;

    const uPlan = (u.plan || u.plan_name || "").toLowerCase();
    if (planFilter !== "all" && !uPlan.includes(planFilter)) return false;

    const uStatus = (u.status || (u.isActive ? "Active" : "Expired")).toLowerCase();
    if (statusFilter !== "all" && uStatus !== statusFilter) return false;

    return true;
  });

  return (
    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-md">
      <h2 className="text-lg font-black text-slate-900 uppercase tracking-tight mb-6 flex items-center gap-2">
        <ShieldCheck className="w-6 h-6 text-indigo-600" />
        Manual Subscription Management
      </h2>

      <div className="flex flex-col md:flex-row gap-4 mb-6">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search by email or name..."
            className="w-full pl-9 pr-4 py-2 text-sm border-2 border-slate-200 rounded-xl focus:outline-none focus:border-indigo-500 transition-colors"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="relative w-full md:w-48">
          <Filter className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" />
          <select
            className="w-full pl-9 pr-4 py-2 text-sm border-2 border-slate-200 rounded-xl focus:outline-none focus:border-indigo-500 appearance-none bg-white font-bold text-slate-700"
            value={planFilter}
            onChange={(e) => setPlanFilter(e.target.value)}
          >
            <option value="all">All Plans</option>
            <option value="basic">Basic</option>
            <option value="premium">Premium</option>
            <option value="enterprise">Enterprise</option>
          </select>
        </div>
        <div className="relative w-full md:w-48">
          <select
            className="w-full px-4 py-2 text-sm border-2 border-slate-200 rounded-xl focus:outline-none focus:border-indigo-500 appearance-none bg-white font-bold text-slate-700"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">All Statuses</option>
            <option value="active">Active</option>
            <option value="expired">Expired</option>
            <option value="suspended">Suspended</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
        
        {selectedUsers.length > 0 && (
          <button
            onClick={openBulkEditModal}
            className="w-full md:w-auto px-4 py-2 text-sm font-black uppercase tracking-wider text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-md transition-all whitespace-nowrap"
          >
            Bulk Update ({selectedUsers.length})
          </button>
        )}
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="py-3 px-4 w-12 text-center">
                <input
                  type="checkbox"
                  className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500 cursor-pointer"
                  checked={filteredUsers.length > 0 && selectedUsers.length === filteredUsers.length}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setSelectedUsers(filteredUsers.map(u => u.uid));
                    } else {
                      setSelectedUsers([]);
                    }
                  }}
                />
              </th>
              <th className="py-3 px-4 text-xs font-black uppercase tracking-wider text-slate-500">User</th>
              <th className="py-3 px-4 text-xs font-black uppercase tracking-wider text-slate-500">Plan</th>
              <th className="py-3 px-4 text-xs font-black uppercase tracking-wider text-slate-500">Status</th>
              <th className="py-3 px-4 text-xs font-black uppercase tracking-wider text-slate-500">Expires</th>
              <th className="py-3 px-4 text-xs font-black uppercase tracking-wider text-slate-500 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredUsers.map((u) => (
              <tr key={u.uid} className="hover:bg-slate-50/50 transition-colors">
                <td className="py-3 px-4 text-center">
                  <input
                    type="checkbox"
                    className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500 cursor-pointer"
                    checked={selectedUsers.includes(u.uid)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedUsers(prev => [...prev, u.uid]);
                      } else {
                        setSelectedUsers(prev => prev.filter(id => id !== u.uid));
                      }
                    }}
                  />
                </td>
                <td className="py-3 px-4">
                  <p className="text-sm font-bold text-slate-800">{u.email}</p>
                  <p className="text-xs text-slate-500">{u.name || "N/A"}</p>
                </td>
                <td className="py-3 px-4">
                  <span className={`inline-flex px-2 py-1 text-[10px] font-black uppercase tracking-wider rounded-md ${
                    (u.plan || "").toLowerCase() === "enterprise" ? "bg-amber-100 text-amber-700 border border-amber-200" :
                    (u.plan || "").toLowerCase() === "premium" ? "bg-indigo-100 text-indigo-700 border border-indigo-200" :
                    "bg-slate-100 text-slate-700 border border-slate-200"
                  }`}>
                    {u.plan || u.plan_name || (u.isActive ? "premium" : "basic")}
                  </span>
                  {u.is_lifetime && <span className="ml-2 text-[10px] font-black text-amber-600">LIFETIME</span>}
                </td>
                <td className="py-3 px-4">
                  <span className={`inline-flex px-2 py-1 text-[10px] font-black uppercase tracking-wider rounded-md ${
                    (u.status || (u.isActive ? "Active" : "Expired")).toLowerCase() === "active" ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"
                  }`}>
                    {u.status || (u.isActive ? "Active" : "Expired")}
                  </span>
                </td>
                <td className="py-3 px-4 text-sm text-slate-600">
                  {u.is_lifetime ? "Never Expires" : ((u.expiresAt || u.expires_at) ? new Date(u.expiresAt || u.expires_at).toLocaleDateString() : "N/A")}
                </td>
                <td className="py-3 px-4 text-right">
                  <button
                    onClick={() => openEditModal(u)}
                    className="px-3 py-1.5 text-xs font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors"
                  >
                    Edit
                  </button>
                </td>
              </tr>
            ))}
            {filteredUsers.length === 0 && !loading && (
              <tr>
                <td colSpan={6} className="py-8 text-center text-sm text-slate-500 font-medium">
                  No users found matching criteria.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {targetUsers.length > 0 && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden border border-slate-200">
            <div className="bg-slate-50 border-b border-slate-200 px-6 py-4 flex items-center justify-between">
              <h3 className="font-black text-slate-800 uppercase tracking-tight flex items-center gap-2">
                Manage Subscription
              </h3>
              <button onClick={() => setTargetUsers([])} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 space-y-4">
              <p className="text-sm font-bold text-slate-700 mb-2">
                {targetUsers.length === 1 ? targetUsers[0].email : `Updating ${targetUsers.length} selected users`}
              </p>
              
              <div>
                <label className="block text-xs font-black uppercase text-slate-500 mb-1.5">Plan</label>
                <select
                  value={editPlan}
                  onChange={(e) => setEditPlan(e.target.value)}
                  className="w-full px-3 py-2 border-2 border-slate-200 rounded-xl text-sm font-bold text-slate-700 focus:border-indigo-500 outline-none"
                >
                  <option value="basic">Basic</option>
                  <option value="premium">Premium</option>
                  <option value="enterprise">Enterprise</option>
                </select>
              </div>
              
              <div>
                <label className="block text-xs font-black uppercase text-slate-500 mb-1.5">Status</label>
                <select
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value)}
                  className="w-full px-3 py-2 border-2 border-slate-200 rounded-xl text-sm font-bold text-slate-700 focus:border-indigo-500 outline-none"
                >
                  <option value="Active">Active</option>
                  <option value="Expired">Expired</option>
                  <option value="Suspended">Suspended</option>
                  <option value="Cancelled">Cancelled</option>
                </select>
              </div>

              <div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editIsLifetime}
                    onChange={(e) => {
                      setEditIsLifetime(e.target.checked);
                      if (e.target.checked) setEditExpiresAt("");
                    }}
                    disabled={editPlan === "enterprise"}
                    className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500"
                  />
                  <span className="text-sm font-bold text-slate-700">Lifetime Access</span>
                </label>
              </div>

              {!editIsLifetime && (
                <div>
                  <label className="block text-xs font-black uppercase text-slate-500 mb-1.5">Expiration Date</label>
                  <input
                    type="date"
                    value={editExpiresAt ? (() => {
                      try {
                        const d = new Date(editExpiresAt);
                        if (isNaN(d.getTime())) return "";
                        const offset = d.getTimezoneOffset();
                        const localDate = new Date(d.getTime() - offset * 60000);
                        return localDate.toISOString().slice(0, 10);
                      } catch (e) {
                        return "";
                      }
                    })() : ""}
                    onChange={(e) => {
                      if (!e.target.value) {
                        setEditExpiresAt("");
                        return;
                      }
                      try {
                        const parts = e.target.value.split('-');
                        if (parts.length === 3) {
                          const year = parseInt(parts[0], 10);
                          const month = parseInt(parts[1], 10) - 1;
                          const day = parseInt(parts[2], 10);
                          // create a date at noon local time to avoid any timezone shifts
                          const d = new Date(year, month, day, 12, 0, 0);
                          setEditExpiresAt(d.toISOString());
                        } else {
                          const d = new Date(e.target.value);
                          if (!isNaN(d.getTime())) {
                            setEditExpiresAt(d.toISOString());
                          }
                        }
                      } catch (err) {
                        console.error(err);
                      }
                    }}
                    className="w-full px-3 py-2 border-2 border-slate-200 rounded-xl text-sm font-bold text-slate-700 focus:border-indigo-500 outline-none"
                  />
                </div>
              )}

              {message && (
                <p className={`text-xs font-bold p-3 rounded-lg ${message.includes('Error') ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-600'}`}>
                  {message}
                </p>
              )}
            </div>

            <div className="bg-slate-50 border-t border-slate-200 px-6 py-4 flex justify-end gap-3">
              <button
                onClick={() => setTargetUsers([])}
                className="px-4 py-2 text-sm font-bold text-slate-600 hover:text-slate-800 transition-colors"
                disabled={saving}
              >
                Cancel
              </button>
              <button
                onClick={handleSaveSubscription}
                disabled={saving}
                className="px-6 py-2 text-sm font-black uppercase tracking-wider text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-md transition-all disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
