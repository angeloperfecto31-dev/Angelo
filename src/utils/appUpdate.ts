import { useSyncExternalStore } from "react";

/**
 * "A new version of ElectricalPH is available" detection.
 *
 * Every build writes /version.json and embeds the same build id (__APP_BUILD__, see vite.config.ts).
 * Open pages fetch /version.json every minute, when the tab becomes visible again and when the
 * connection comes back; when the deployed id differs from the running one, the update is reported
 * to every subscriber (the update banner and the notification bell).
 */
export interface AppBuild {
  version: string;
  builtAt: string;
  /** Short description of the change (the merged pull-request title on Vercel) */
  summary?: string;
}

declare const __APP_BUILD__: AppBuild;

export const RUNNING_BUILD: AppBuild =
  typeof __APP_BUILD__ !== "undefined" ? __APP_BUILD__ : { version: "dev", builtAt: "" };

const POLL_MS = 60_000;
const DISMISS_KEY = "ephUpdateDismissed";

interface UpdateState {
  available: AppBuild | null;
  /** The user chose "Later" for this version: the banner stays hidden, the bell still shows it */
  dismissed: boolean;
}

let state: UpdateState = { available: null, dismissed: false };
const listeners = new Set<() => void>();
let started = false;
let checking = false;

const emit = (next: UpdateState) => {
  state = next;
  listeners.forEach((l) => l());
};

const readDismissed = (version: string) => {
  try {
    return sessionStorage.getItem(DISMISS_KEY) === version;
  } catch {
    return false;
  }
};

export async function checkForAppUpdate(): Promise<AppBuild | null> {
  if (checking || RUNNING_BUILD.version === "dev") return state.available;
  checking = true;
  try {
    const res = await fetch(`/version.json?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) return state.available;
    const type = res.headers.get("content-type") || "";
    if (!type.includes("json")) return state.available;
    const latest = (await res.json()) as AppBuild;
    if (latest?.version && latest.version !== RUNNING_BUILD.version) {
      if (state.available?.version !== latest.version) {
        emit({ available: latest, dismissed: readDismissed(latest.version) });
      }
    }
  } catch {
    // Offline or blocked: try again on the next check
  } finally {
    checking = false;
  }
  return state.available;
}

function start() {
  if (started || typeof window === "undefined") return;
  started = true;
  const check = () => void checkForAppUpdate();
  window.setInterval(() => {
    if (document.visibilityState === "visible") check();
  }, POLL_MS);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") check();
  });
  window.addEventListener("focus", check);
  window.addEventListener("online", check);
  check();
}

function subscribe(listener: () => void) {
  start();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The newer deployed build, if any, and whether the user postponed it */
export function useAppUpdate(): UpdateState {
  return useSyncExternalStore(subscribe, () => state, () => state);
}

export function dismissAppUpdate() {
  if (!state.available) return;
  try {
    sessionStorage.setItem(DISMISS_KEY, state.available.version);
  } catch {
    // The banner still hides for this page
  }
  emit({ ...state, dismissed: true });
}

/** Loads the new version (the browser fetches the new index.html and its new assets) */
export function reloadForUpdate() {
  try {
    sessionStorage.removeItem(DISMISS_KEY);
  } catch {
    // ignore
  }
  window.location.reload();
}
