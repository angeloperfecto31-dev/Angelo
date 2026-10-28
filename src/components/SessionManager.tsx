import React, { useEffect, useMemo, useState } from "react";
import { addDoc, collection, deleteDoc, onSnapshot } from "firebase/firestore";
import { MonitorSmartphone, LogOut, RefreshCw } from "lucide-react";
import { auth, db } from "../firebase";
import { MAX_SESSION_TTL_S, MIN_SESSION_TTL_S, adminSessionRef, loadSessionTimeout, saveSessionTimeout, type ActiveSession } from "../utils/sessionGuard";

/**
 * Administrator view of the single-device sessions: who is signed in, on which device, and when the device
 * was last seen. "Force sign out" ends a session (for example a lost device) so the account can sign in
 * again elsewhere; the device is signed out at its next heartbeat. Actions are logged like other admin actions.
 */
export default function SessionManager() {
  const [sessions, setSessions] = useState<ActiveSession[]>([]);
  const [emails, setEmails] = useState<Record<string, string>>({});
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("");
  // Session timeout (configurable; the Firestore rules read the same setting)
  const [ttlMs, setTtlMs] = useState(240_000);
  const [ttlInput, setTtlInput] = useState("4");
  const [ttlMsg, setTtlMsg] = useState("");
  useEffect(() => {
    loadSessionTimeout().then((ms) => { setTtlMs(ms); setTtlInput(String(ms / 60000)); });
  }, []);
  const saveTtl = async () => {
    setTtlMsg("");
    try {
      const secs = Math.round(parseFloat(ttlInput) * 60);
      await saveSessionTimeout(secs, auth.currentUser?.email || "Unknown Admin");
      setTtlMs(secs * 1000);
      setTtlMsg("Saved. It applies to all accounts at their next request.");
      await addDoc(collection(db, "admin_activity_logs"), {
        action: "session_timeout_changed", adminEmail: auth.currentUser?.email || "Unknown Admin",
        timestamp: new Date().toISOString(), details: { ttlSeconds: secs },
      }).catch(() => undefined);
    } catch (e: any) {
      setTtlMsg(`Not saved: ${e.message}`);
    }
  };

  useEffect(() => {
    const unsubS = onSnapshot(
      collection(db, "activeSessions"),
      (snap) => setSessions(snap.docs.map((d) => d.data() as ActiveSession)),
      (e) => setError(`Could not load sessions: ${e.message}`),
    );
    const unsubU = onSnapshot(collection(db, "users"), (snap) => {
      const m: Record<string, string> = {};
      snap.docs.forEach((d) => (m[d.id] = (d.data() as any).email || ""));
      setEmails(m);
    });
    const t = setInterval(() => setNow(Date.now()), 15000);
    return () => { unsubS(); unsubU(); clearInterval(t); };
  }, []);

  const rows = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return sessions
      .map((s) => {
        const last = s.lastSeen?.toMillis?.() ?? 0;
        return { ...s, email: emails[s.uid] || s.uid, last, active: last > 0 && now - last <= ttlMs };
      })
      .filter((r) => !q || r.email.toLowerCase().includes(q) || r.device.toLowerCase().includes(q))
      .sort((a, b) => Number(b.active) - Number(a.active) || b.last - a.last);
  }, [sessions, emails, now, filter, ttlMs]);

  const forceSignOut = async (uid: string, email: string, device: string) => {
    setBusy(uid);
    setError("");
    try {
      await deleteDoc(adminSessionRef(uid));
      await addDoc(collection(db, "admin_activity_logs"), {
        action: "force_sign_out",
        adminEmail: auth.currentUser?.email || "Unknown Admin",
        timestamp: new Date().toISOString(),
        targetUserUid: uid,
        targetUserEmail: email,
        details: { device },
      }).catch(() => undefined);
    } catch (e: any) {
      setError(`Could not end the session: ${e.message}`);
    } finally {
      setBusy(null);
    }
  };

  const ago = (ms: number) => {
    if (!ms) return "-";
    const s = Math.max(0, Math.round((now - ms) / 1000));
    return s < 60 ? `${s}s ago` : s < 3600 ? `${Math.round(s / 60)} min ago` : `${Math.round(s / 3600)} h ago`;
  };
  const activeCount = rows.filter((r) => r.active).length;

  return (
    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-md space-y-4">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-black text-slate-900 uppercase tracking-tight flex items-center gap-2">
            <MonitorSmartphone className="w-4 h-4 text-indigo-600" /> Active Sessions (one device per account)
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            {activeCount} active · a session with no activity for {Math.round(ttlMs / 60000)} minutes expires and the account can sign in on another device.
          </p>
          <div className="flex flex-wrap items-center gap-2 mt-2 text-xs">
            <label className="font-bold text-slate-600">Session timeout (minutes)</label>
            <input
              type="number"
              min={MIN_SESSION_TTL_S / 60}
              max={MAX_SESSION_TTL_S / 60}
              step={1}
              value={ttlInput}
              onChange={(e) => setTtlInput(e.target.value)}
              className="w-20 px-2 py-1 rounded-lg border border-slate-200"
            />
            <button onClick={saveTtl} className="px-3 py-1 rounded-lg bg-indigo-600 text-white font-bold hover:bg-indigo-500">Save</button>
            <span className="text-slate-400">{MIN_SESSION_TTL_S / 60} to {MAX_SESSION_TTL_S / 60} minutes</span>
            {ttlMsg && <span className={ttlMsg.startsWith("Saved") ? "text-emerald-600 font-bold" : "text-rose-600 font-bold"}>{ttlMsg}</span>}
          </div>
        </div>
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter by email or device"
          className="w-full md:w-64 px-3 py-2 text-xs rounded-lg border border-slate-200"
        />
      </div>
      {error && <p className="text-xs font-bold text-rose-600">{error}</p>}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-slate-200 text-[10px] uppercase tracking-wider text-slate-500">
              <th className="py-2 pr-3">Account</th>
              <th className="py-2 pr-3">Device</th>
              <th className="py-2 pr-3">Signed in</th>
              <th className="py-2 pr-3">Last activity</th>
              <th className="py-2 pr-3">Status</th>
              <th className="py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.length === 0 && (
              <tr><td colSpan={6} className="py-6 text-center text-slate-400">No sessions.</td></tr>
            )}
            {rows.map((r) => (
              <tr key={r.uid}>
                <td className="py-2 pr-3 font-semibold text-slate-800 break-all">{r.email}</td>
                <td className="py-2 pr-3 text-slate-600">{r.device}</td>
                <td className="py-2 pr-3 text-slate-500">{r.createdAt?.toDate?.().toLocaleString() || "-"}</td>
                <td className="py-2 pr-3 text-slate-500">{ago(r.last)}</td>
                <td className="py-2 pr-3">
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${r.active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                    {r.active ? "Active" : "Expired"}
                  </span>
                </td>
                <td className="py-2 text-right">
                  <button
                    onClick={() => forceSignOut(r.uid, r.email, r.device)}
                    disabled={busy === r.uid}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-black uppercase bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 disabled:opacity-50"
                    title={r.uid === auth.currentUser?.uid ? "This is your own session: you will be signed out" : "End this session so the account can sign in on another device"}
                  >
                    {busy === r.uid ? <RefreshCw className="w-3 h-3 animate-spin" /> : <LogOut className="w-3 h-3" />}
                    {r.active ? "Force sign out" : "Clear"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
