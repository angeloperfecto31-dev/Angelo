/**
 * Single-device sessions.
 *
 * Each account has one record, activeSessions/{uid}, holding the active session: a random session id, the
 * device, and the sign-in time ("auth_time") of the Firebase ID token that owns it. The Firestore security
 * rules (firestore.rules) are the enforcement point, evaluated on Google's servers:
 *   - a session can be claimed only when there is none, it is the caller's own, or it has timed out;
 *   - user data can be read or written only by the token whose auth_time matches the active session, and
 *     only while its heartbeat is fresh.
 * auth_time is part of the signed ID token, so another device cannot present it. The heartbeat
 * (lastSeen = server time) keeps the session alive; a session with no heartbeat for the session timeout
 * (browser closed, network lost, device asleep) expires and the account can sign in elsewhere.
 * The timeout is configurable by administrators (sessionConfig/global.ttlSeconds, 2 to 60 minutes) and read
 * by both the rules and this module; without it both use DEFAULT_SESSION_TTL_S.
 */
import { User, signOut } from "firebase/auth";
import { deleteDoc, doc, getDoc, onSnapshot, runTransaction, serverTimestamp, setDoc, Timestamp, updateDoc } from "firebase/firestore";
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
}

export class SessionBlockedError extends Error {
  constructor(public device: string, public lastSeen: Date | null) {
    super("This account is already signed in on another device.");
    this.name = "SessionBlockedError";
  }
}

/** Short, readable description of this browser / device (stored with the session, shown to the user) */
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

/** auth_time (seconds) of the current ID token: the sign-in this browser holds */
async function tokenAuthTime(user: User): Promise<number> {
  const r = await user.getIdTokenResult();
  return Number(r.claims.auth_time);
}

const isExpired = (s: { lastSeen?: Timestamp | null }) =>
  !s.lastSeen || Date.now() - s.lastSeen.toMillis() > SESSION_TTL_MS;

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

/**
 * Claims the account's single session for this sign-in. Throws SessionBlockedError when another device holds
 * an active session. Concurrent claims are serialized by the transaction and, authoritatively, by the rules.
 */
export async function claimSession(user: User): Promise<void> {
  const authTime = await tokenAuthTime(user);
  await loadSessionTimeout();
  const ref = doc(db, COLLECTION, user.uid);
  const sessionId = randomId();
  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      const s = snap.exists() ? (snap.data() as ActiveSession) : null;
      if (s && s.authTime !== authTime && !isExpired(s)) throw new SessionBlockedError(s.device, s.lastSeen?.toDate() ?? null);
      const own = s && s.authTime === authTime;
      tx.set(ref, {
        uid: user.uid,
        sessionId: own ? s!.sessionId : sessionId,
        authTime,
        device: describeDevice(),
        createdAt: own ? s!.createdAt : serverTimestamp(),
        lastSeen: serverTimestamp(),
      });
    });
  } catch (e: any) {
    if (e instanceof SessionBlockedError) throw e;
    // The rules refused the claim: another device holds the session (or the clocks disagree on expiry)
    if (e?.code === "permission-denied") {
      let snap;
      try {
        snap = await getDoc(ref);
      } catch (readErr: any) {
        // With the session rules deployed an account can always read its own session record. If it cannot,
        // the rules are not deployed yet (rollout): carry on without a session, as before this feature.
        if (readErr?.code === "permission-denied") {
          console.error(
            `Single-device sessions are NOT enforced: the session rules are not deployed on Firestore database "${FIRESTORE_DATABASE_ID}". Deploy firestore.rules to that database (npm run deploy:rules).`,
          );
          enforcement = "inactive";
          current = null;
          return;
        }
        throw readErr;
      }
      const s = snap.exists() ? (snap.data() as ActiveSession) : null;
      throw new SessionBlockedError(s?.device || "another device", s?.lastSeen?.toDate() ?? null);
    }
    throw e;
  }
  enforcement = "active";
  const saved = await getDoc(ref);
  current = { uid: user.uid, sessionId: (saved.data() as ActiveSession)?.sessionId || sessionId, authTime };
}

/** Ends this device's session (before signing out) so the account can sign in elsewhere at once */
export async function releaseSession(): Promise<void> {
  const u = auth.currentUser;
  if (!u) return;
  try {
    const ref = doc(db, COLLECTION, u.uid);
    const snap = await getDoc(ref);
    if (snap.exists() && (snap.data() as ActiveSession).authTime === (current?.authTime ?? (await tokenAuthTime(u)))) await deleteDoc(ref);
  } catch (e) {
    console.warn("Session release failed; it will expire on its own.", e);
  } finally {
    current = null;
  }
}

/** Sign out everywhere in the app: releases the session first, then signs out of Firebase Auth */
export async function logout(): Promise<void> {
  await releaseSession();
  await signOut(auth);
}

export type SessionEndReason = "replaced" | "revoked";

/**
 * Keeps this device's session alive (heartbeat every minute, and when the tab is shown or the network
 * returns) and watches the record. onEnd is called when the session is gone: taken over after it timed out
 * ("replaced") or ended by an administrator ("revoked"). Returns a stop function.
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

  const beat = async () => {
    if (stopped || ended) return;
    if (typeof navigator !== "undefined" && navigator.onLine === false) return;
    if (!current) {
      // No session yet (rules were not active when this tab signed in): claim one now; if another device
      // already holds the session, this tab must sign out.
      try {
        await claimSession(user);
      } catch (err: any) {
        if (err instanceof SessionBlockedError) end("replaced", err.device);
      }
      return;
    }
    try {
      await updateDoc(ref, { lastSeen: serverTimestamp() });
    } catch (e: any) {
      if (e?.code === "not-found") return end("revoked");
      if (e?.code === "permission-denied") {
        // Our session timed out (e.g. device asleep). Reclaim it unless another device has it now.
        try {
          await claimSession(user);
        } catch (err: any) {
          if (err instanceof SessionBlockedError) end("replaced", err.device);
        }
      }
      // Network errors: retried on the next beat / when back online
    }
  };

  const unsub = onSnapshot(
    ref,
    (snap) => {
      if (!current) return;
      if (!snap.exists()) return end("revoked");
      const s = snap.data() as ActiveSession;
      if (s.authTime !== current.authTime) end("replaced", s.device);
    },
    () => {
      /* read denied once the session is no longer ours; the heartbeat decides */
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
  try {
    localStorage.setItem(NOTICE_KEY, text);
  } catch {
    /* storage unavailable */
  }
  // The login screen may already be showing (a blocked sign-in never leaves it)
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

/** The message shown to a device whose sign-in was refused because another device holds the session */
export const BLOCKED_MESSAGE = "Your account is currently active on another device. Please log out from your existing device before logging in here.";

export function blockedMessage(e: SessionBlockedError): string {
  const mins = Math.ceil(SESSION_TTL_MS / 60000);
  return `${BLOCKED_MESSAGE} (Active on: ${e.device}. If that device was closed or lost its connection, its session ends after ${mins} minutes without activity; an administrator can also end it.)`;
}

// ---- admin
export function adminSessionRef(uid: string) {
  return doc(db, COLLECTION, uid);
}
