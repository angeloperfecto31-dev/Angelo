/**
 * Single active session per account: the newest sign-in wins.
 *
 * Each account has one record, activeSessions/{uid}: a random session id, the device, the sign-in time
 * ("auth_time") of the Firebase ID token that owns it, a heartbeat time and an "ended" flag. The Firestore
 * security rules (firestore.rules) enforce it on Google's servers:
 *   - a sign-in can take the session over only from an OLDER sign-in (larger auth_time), so a device that
 *     was replaced can never take it back without signing in again;
 *   - user data can be read or written only by the token whose auth_time matches the active session, while
 *     the session is not ended and its heartbeat is fresh.
 * auth_time is part of the signed ID token: no device can claim to be newer than it is. The moment a newer
 * sign-in takes over, the rules refuse every request from the previous one (open listeners included, because
 * the record they depend on changed), and its watcher signs it out with TERMINATED_MESSAGE.
 * Tabs of one browser share one sign-in and one session id, so they do not replace each other.
 * Logout and an administrator's "Force sign out" mark the session ended (the record is kept as the
 * watermark of the newest sign-in, so an older device cannot create a new session afterwards).
 * The heartbeat timeout is configurable by administrators (sessionConfig/global.ttlSeconds, 2 to 60
 * minutes) and read by both the rules and this module; without it both use DEFAULT_SESSION_TTL_S.
 */
import { User, signOut } from "firebase/auth";
import { doc, getDoc, onSnapshot, runTransaction, serverTimestamp, setDoc, Timestamp, updateDoc } from "firebase/firestore";
import { auth, db } from "../firebase";
import firebaseConfig from "../../firebase-applet-config.json";

export const DEFAULT_SESSION_TTL_S = 240;
export const MIN_SESSION_TTL_S = 120;
export const MAX_SESSION_TTL_S = 3600;
const COLLECTION = "activeSessions";
const CONFIG_PATH = ["sessionConfig", "global"] as const;

/** Current session timeout (ms); refreshed from sessionConfig/global at every claim */
export let SESSION_TTL_MS = DEFAULT_SESSION_TTL_S * 1000;
/** Heartbeat: a third of the timeout, at most once a minute, so two missed beats do not end a session */
const heartbeatMs = () => Math.min(60_000, Math.max(20_000, Math.floor(SESSION_TTL_MS / 3)));

/** Reads the administrator-set timeout (the rules use the same document) */
export async function loadSessionTimeout(): Promise<number> {
  try {
    const snap = await getDoc(doc(db, ...CONFIG_PATH));
    const t = Number(snap.exists() ? snap.data()?.ttlSeconds : NaN);
    SESSION_TTL_MS = (Number.isInteger(t) && t >= MIN_SESSION_TTL_S && t <= MAX_SESSION_TTL_S ? t : DEFAULT_SESSION_TTL_S) * 1000;
  } catch {
    SESSION_TTL_MS = DEFAULT_SESSION_TTL_S * 1000;
  }
  return SESSION_TTL_MS;
}

/** Administrators: sets the session timeout for every account (seconds, 2 to 60 minutes) */
export async function saveSessionTimeout(seconds: number, adminEmail: string): Promise<void> {
  const t = Math.round(seconds);
  if (!(t >= MIN_SESSION_TTL_S && t <= MAX_SESSION_TTL_S)) throw new Error("Timeout must be between 2 and 60 minutes.");
  await setDoc(doc(db, ...CONFIG_PATH), { ttlSeconds: t, updatedBy: adminEmail, updatedAt: serverTimestamp() });
  SESSION_TTL_MS = t * 1000;
}

export interface ActiveSession {
  uid: string;
  sessionId: string;
  authTime: number;
  device: string;
  createdAt: Timestamp;
  lastSeen: Timestamp;
  /** Logged out or ended by an administrator; the record stays as the watermark of the newest sign-in */
  ended?: boolean;
  endedBy?: "logout" | "admin";
}

/** Shown on a device whose session was taken over by a newer sign-in */
export const TERMINATED_MESSAGE =
  "Your session has been terminated because your account was signed in on another device or browser. Please log in again to continue.";
export const REVOKED_MESSAGE = "Your session was ended by an administrator. Please log in again to continue.";

export type SessionEndReason = "replaced" | "revoked" | "loggedOut";

/** This browser's sign-in no longer holds the session */
export class SessionEndedError extends Error {
  constructor(public reason: SessionEndReason, public device?: string) {
    super(reason === "replaced" ? TERMINATED_MESSAGE : reason === "revoked" ? REVOKED_MESSAGE : "Signed out.");
    this.name = "SessionEndedError";
  }
}

export function messageFor(reason: SessionEndReason): string {
  return reason === "replaced" ? TERMINATED_MESSAGE : reason === "revoked" ? REVOKED_MESSAGE : "";
}

/** Short, readable description of this browser / device (stored with the session, shown to administrators) */
export function describeDevice(): string {
  if (typeof navigator === "undefined") return "Unknown device";
  const ua = navigator.userAgent;
  const os = /Android/i.test(ua) ? "Android" : /iPhone|iPod/i.test(ua) ? "iPhone" : /iPad/i.test(ua) || (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1) ? "iPad"
    : /Windows/i.test(ua) ? "Windows" : /Mac OS X|Macintosh/i.test(ua) ? "Mac" : /CrOS/i.test(ua) ? "ChromeOS" : /Linux/i.test(ua) ? "Linux" : "Unknown OS";
  const browser = /Edg\//i.test(ua) ? "Edge" : /OPR\//i.test(ua) ? "Opera" : /SamsungBrowser/i.test(ua) ? "Samsung Internet" : /Firefox|FxiOS/i.test(ua) ? "Firefox"
    : /Chrome|CriOS/i.test(ua) ? "Chrome" : /Safari/i.test(ua) ? "Safari" : "Browser";
  const kind = /Mobi|iPhone|Android.+Mobile/i.test(ua) ? "phone" : /iPad|Tablet|Android/i.test(ua) || (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1) ? "tablet" : "computer";
  return `${browser} on ${os} (${kind})`.slice(0, 120);
}

const randomId = () => {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
};

/** auth_time (seconds) of the current ID token: the sign-in this browser holds (unchanged by token refresh) */
async function tokenAuthTime(user: User): Promise<number> {
  const r = await user.getIdTokenResult();
  return Number(r.claims.auth_time);
}

// Session id of this browser's sign-in, shared by its tabs (same storage, same sign-in)
const idKey = (uid: string, authTime: number) => `ephSession:${uid}:${authTime}`;
const memoryIds: Record<string, string> = {};
function storedSessionId(uid: string, authTime: number): string | null {
  try {
    return localStorage.getItem(idKey(uid, authTime)) || memoryIds[idKey(uid, authTime)] || null;
  } catch {
    return memoryIds[idKey(uid, authTime)] || null;
  }
}
function storeSessionId(uid: string, authTime: number, id: string | null) {
  const k = idKey(uid, authTime);
  if (id) memoryIds[k] = id;
  else delete memoryIds[k];
  try {
    if (id) localStorage.setItem(k, id);
    else localStorage.removeItem(k);
  } catch {
    /* storage unavailable: kept in memory for this tab */
  }
}

let current: { uid: string; sessionId: string; authTime: number } | null = null;

/**
 * Whether the server enforces single sessions. "inactive" means the session rules are not deployed on this
 * app's Firestore database, so nothing is enforced; shown to administrators in the Sessions tab.
 */
export type EnforcementState = "unknown" | "active" | "inactive";
let enforcement: EnforcementState = "unknown";
export const getEnforcementState = () => enforcement;
/** The Firestore database the rules must be deployed to (named database, not "(default)") */
export const FIRESTORE_DATABASE_ID: string = (firebaseConfig as any).firestoreDatabaseId || "(default)";

/** Why this sign-in may not hold the session, given the record (null: it may) */
function refusal(s: ActiveSession | null, authTime: number, mine: string | null): SessionEndedError | null {
  if (!s) return null;
  if (s.authTime > authTime) return new SessionEndedError("replaced", s.device); // a newer sign-in holds it
  if (s.authTime === authTime) {
    if (s.ended) return new SessionEndedError(s.endedBy === "admin" ? "revoked" : "loggedOut");
    // Same sign-in second on two devices (practically never): the device that registered first keeps it
    if (mine && s.sessionId !== mine) return new SessionEndedError("replaced", s.device);
  }
  return null; // an older or ended sign-in: this one takes over
}

/**
 * Makes this sign-in the account's single active session, taking it over from any older sign-in (which
 * is signed out at once). Throws SessionEndedError when this browser's sign-in is itself older than the
 * session's, or was ended. Concurrent claims are serialized by the transaction and, authoritatively, by the
 * rules: whatever the order of the writes, the newest sign-in ends up holding the session.
 */
export async function claimSession(user: User): Promise<void> {
  const authTime = await tokenAuthTime(user);
  await loadSessionTimeout();
  const ref = doc(db, COLLECTION, user.uid);
  let sessionId = storedSessionId(user.uid, authTime);
  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      const s = snap.exists() ? (snap.data() as ActiveSession) : null;
      const refused = refusal(s, authTime, sessionId);
      if (refused) throw refused;
      const same = s && s.authTime === authTime;
      // A record left by this sign-in before session ids were kept per browser: adopt its id
      if (!sessionId) sessionId = same ? s!.sessionId : randomId();
      tx.set(ref, {
        uid: user.uid,
        sessionId,
        authTime,
        device: describeDevice(),
        createdAt: same ? s!.createdAt : serverTimestamp(),
        lastSeen: serverTimestamp(),
        ended: false,
      });
    });
  } catch (e: any) {
    if (e instanceof SessionEndedError) {
      current = null;
      throw e;
    }
    if (e?.code === "permission-denied") {
      let snap;
      try {
        snap = await getDoc(ref);
      } catch (readErr: any) {
        // With the session rules deployed an account can always read its own session record. If it cannot,
        // the rules are not deployed on this database: carry on without a session, as before this feature.
        if (readErr?.code === "permission-denied") {
          console.error(
            `Single-session enforcement is NOT active: the session rules are not deployed on Firestore database "${FIRESTORE_DATABASE_ID}". Deploy firestore.rules to that database (npm run deploy:rules).`,
          );
          enforcement = "inactive";
          current = null;
          return;
        }
        throw readErr;
      }
      const refused = refusal(snap.exists() ? (snap.data() as ActiveSession) : null, authTime, sessionId);
      current = null;
      throw refused || new SessionEndedError("replaced");
    }
    throw e;
  }
  storeSessionId(user.uid, authTime, sessionId);
  enforcement = "active";
  current = { uid: user.uid, sessionId: sessionId!, authTime };
}

/** Ends this browser's session (before signing out); the record stays as the watermark of this sign-in */
export async function releaseSession(): Promise<void> {
  const u = auth.currentUser;
  if (!u) return;
  try {
    const authTime = current?.authTime ?? (await tokenAuthTime(u));
    const ref = doc(db, COLLECTION, u.uid);
    const snap = await getDoc(ref);
    const s = snap.exists() ? (snap.data() as ActiveSession) : null;
    if (s && s.authTime === authTime && !s.ended) await updateDoc(ref, { ended: true, endedBy: "logout", lastSeen: serverTimestamp() });
    storeSessionId(u.uid, authTime, null);
  } catch (e) {
    console.warn("Session release failed; it ends with the next sign-in or the timeout.", e);
  } finally {
    current = null;
  }
}

/** Sign out everywhere in the app: ends the session first, then signs out of Firebase Auth */
export async function logout(): Promise<void> {
  await releaseSession();
  await signOut(auth);
}

/**
 * Keeps this browser's session alive (heartbeat every minute, and when the tab is shown or the network
 * returns) and watches the record. onEnd is called as soon as the session is no longer this browser's:
 * taken over by a newer sign-in ("replaced"), ended by an administrator ("revoked") or logged out from
 * another tab ("loggedOut"). Returns a stop function.
 */
export function watchSession(user: User, onEnd: (reason: SessionEndReason, device?: string) => void): () => void {
  const ref = doc(db, COLLECTION, user.uid);
  let stopped = false;
  let ended = false;
  const end = (reason: SessionEndReason, device?: string) => {
    if (ended || stopped) return;
    ended = true;
    current = null;
    onEnd(reason, device);
  };
  const reclaim = async () => {
    try {
      await claimSession(user);
    } catch (err: any) {
      if (err instanceof SessionEndedError) end(err.reason, err.device);
    }
  };

  const beat = async () => {
    if (stopped || ended) return;
    if (typeof navigator !== "undefined" && navigator.onLine === false) return;
    // No session yet (rules were not active when this tab signed in): claim it now
    if (!current) return reclaim();
    try {
      await updateDoc(ref, { lastSeen: serverTimestamp() });
    } catch (e: any) {
      // Refused: timed out while asleep (reclaimed if still ours) or taken over (signed out)
      if (e?.code === "permission-denied" || e?.code === "not-found") return reclaim();
      // Network errors: retried on the next beat / when back online
    }
  };

  // Immediate sign-out when a newer sign-in takes over (no need to wait for a heartbeat)
  const unsub = onSnapshot(
    ref,
    (snap) => {
      if (!current) return;
      if (!snap.exists()) return reclaim();
      const s = snap.data() as ActiveSession;
      const refused = refusal(s, current.authTime, current.sessionId);
      if (refused) end(refused.reason, refused.device);
    },
    () => {
      /* read refused once the session is no longer ours: the heartbeat confirms and signs out */
    },
  );
  const timer = setInterval(beat, heartbeatMs());
  const onVisible = () => {
    if (document.visibilityState === "visible") beat();
  };
  window.addEventListener("online", beat);
  document.addEventListener("visibilitychange", onVisible);
  beat();
  return () => {
    stopped = true;
    clearInterval(timer);
    unsub();
    window.removeEventListener("online", beat);
    document.removeEventListener("visibilitychange", onVisible);
  };
}

// ---- messages carried to the login screen
const NOTICE_KEY = "session_notice";
export const SESSION_NOTICE_EVENT = "electricalph-session-notice";
export function setSessionNotice(text: string) {
  if (!text) return;
  try {
    localStorage.setItem(NOTICE_KEY, text);
  } catch {
    /* storage unavailable */
  }
  // The login screen may already be showing
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(SESSION_NOTICE_EVENT, { detail: text }));
}
export function takeSessionNotice(): string {
  try {
    const t = localStorage.getItem(NOTICE_KEY) || "";
    if (t) localStorage.removeItem(NOTICE_KEY);
    return t;
  } catch {
    return "";
  }
}

// ---- admin
export function adminSessionRef(uid: string) {
  return doc(db, COLLECTION, uid);
}

/** Administrators: ends a user's session (the device is signed out at once) */
export async function adminEndSession(uid: string): Promise<void> {
  await updateDoc(doc(db, COLLECTION, uid), { ended: true, endedBy: "admin" });
}
