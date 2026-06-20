import {
  decideRoute,
  formatUsdFromCents,
  type EstimateResponse,
  type OptimizationMode,
  type OptimizedPromptContext
} from "@atacredits/shared";

export function estimateCostCents(tokens: number): number {
  return Math.max(3, Math.min(18, Math.ceil(tokens / 650)));
}

export function buildEstimateResponse(input: {
  optimized: OptimizedPromptContext;
  availableCreditsCents: number;
  availableCreditsUsd: string;
  optimizationMode: OptimizationMode;
  minSponsoredBalanceCents: number;
  safetyMarginPercent: number;
  maxSponsoredCostPerRequestCents: number;
}): EstimateResponse {
  const estimatedCostCents = estimateCostCents(input.optimized.optimizedTokens);
  const decision = decideRoute({
    availableCreditsCents: input.availableCreditsCents,
    estimatedCostCents,
    minSponsoredBalanceCents: input.minSponsoredBalanceCents,
    safetyMarginPercent: input.safetyMarginPercent,
    maxSponsoredCostPerRequestCents: input.maxSponsoredCostPerRequestCents
  });

  return {
    route: decision.route,
    reason: decision.reason,
    originalTokens: input.optimized.originalTokens,
    optimizedTokens: input.optimized.optimizedTokens,
    estimatedSavingsPercent: input.optimized.savingsPercent,
    estimatedCostCents,
    estimatedCostUsd: formatUsdFromCents(estimatedCostCents),
    requiredBalanceCents: decision.requiredBalanceCents,
    requiredBalanceUsd: formatUsdFromCents(decision.requiredBalanceCents),
    availableCreditsCents: input.availableCreditsCents,
    availableCreditsUsd: input.availableCreditsUsd,
    optimizationMode: input.optimizationMode,
    optimizationNotes: input.optimized.notes
  };
}
