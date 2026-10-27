/**
 * Transformer maximum demand, shared by the Transformer section and the Power Analysis Suite so both show
 * the same demand kVA and loading.
 *
 * S_demand = S_connected × demand factor. The demand factor is the user's value (0 < DF ≤ 1) when set,
 * otherwise the PEC Article 2.20 lighting / receptacle reduction of the Load Schedule, otherwise 0.80.
 */
export function transformerDemand(
  sched: { totalVA?: number; lightingReceptacleVA?: number; lightingReceptacleDemand?: number },
  demandFactor?: number,
) {
  const connectedVA = sched.totalVA || 0;
  let computed = 0.8;
  if (connectedVA > 0) {
    const lightingReduction = Math.max(0, (sched.lightingReceptacleVA || 0) - (sched.lightingReceptacleDemand || 0));
    const ratio = Math.max(0, connectedVA - lightingReduction) / connectedVA;
    if (ratio < 0.999) computed = Number(Math.max(0.2, Math.min(1, ratio)).toFixed(2));
  }
  const userSet = typeof demandFactor === "number" && demandFactor > 0 && demandFactor <= 1;
  const factor = userSet ? demandFactor! : computed;
  return {
    connectedKva: connectedVA / 1000,
    computedFactor: computed,
    factor,
    factorSource: userSet ? "Transformer section" : "PEC Art. 2.20 lighting / receptacle demand (Load Schedule)",
    demandKva: (connectedVA / 1000) * factor,
  };
}
