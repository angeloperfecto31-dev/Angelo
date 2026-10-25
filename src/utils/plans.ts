/**
 * Subscription plans in one place.
 *
 *   basic       30 days   core modules
 *   premium     30 days   all modules and exports
 *   annual      365 days  all modules and exports (12 months)
 *   enterprise  lifetime  all modules and exports
 *
 * The Admin Section is never part of a plan: it is limited to the authorised administrator account.
 */

export type PlanId = "basic" | "premium" | "annual" | "enterprise";

export const PLAN_IDS: PlanId[] = ["basic", "premium", "annual", "enterprise"];

export const PLAN_LABELS: Record<PlanId, string> = {
  basic: "Basic",
  premium: "Premium",
  annual: "Annual",
  enterprise: "Enterprise",
};

/** Default prices (PHP) when the admin pricing settings have not been saved */
export const DEFAULT_PLAN_PRICES: Record<PlanId, number> = {
  basic: 999,
  premium: 1499,
  annual: 14990,
  enterprise: 2999,
};

const norm = (plan?: string | null) => (plan || "").trim().toLowerCase();

/** Plans with every module and export (Premium, Annual, Enterprise) */
export const isFullAccessPlan = (plan?: string | null) => ["premium", "annual", "enterprise"].includes(norm(plan));

/** Plans that run for a fixed period and expire (Basic, Premium, Annual) */
export const isExpiringPlan = (plan?: string | null) => ["basic", "premium", "annual"].includes(norm(plan));

/** Subscription length in days; null = lifetime (Enterprise) */
export function planDurationDays(plan?: string | null): number | null {
  const p = norm(plan);
  if (p === "annual") return 365;
  if (p === "basic" || p === "premium") return 30;
  return null;
}

/** Expiry date (ISO) for a subscription starting at `from`; null for lifetime plans */
export function planExpiryIso(plan?: string | null, from: Date = new Date()): string | null {
  const days = planDurationDays(plan);
  return days == null ? null : new Date(from.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
}

export const planLabel = (plan?: string | null) => PLAN_LABELS[norm(plan) as PlanId] || (plan ? plan : "Basic");
