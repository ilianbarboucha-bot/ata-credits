export type RouteMode = "sponsored" | "official";

export type OptimizationMode = "recommended" | "conservative" | "off";

export type AuthProvider = "email_magic_link" | "google_mock";

export type ImpressionStatus =
  | "PENDING"
  | "CONFIRMED"
  | "REJECTED"
  | "SUSPICIOUS";

export type AiRequestStatus = "PROCESSING" | "SUCCESS" | "REJECTED" | "FAILED";

export type LedgerEntryType =
  | "AD_PENDING_CREDIT"
  | "AD_CONFIRMED_CREDIT"
  | "AD_REJECTED"
  | "AI_REQUEST_RESERVE"
  | "AI_REQUEST_CAPTURE"
  | "AI_REQUEST_REFUND"
  | "MANUAL_ADJUSTMENT"
  | "WELCOME_BONUS";

export interface PromptContext {
  prompt: string;
  model?: string;
}

export interface OptimizedPromptContext {
  prompt: string;
  mode: OptimizationMode;
  originalTokens: number;
  optimizedTokens: number;
  savingsPercent: number;
  notes: string[];
}

export interface AuthLoginRequest {
  email: string;
  provider?: AuthProvider;
}

export interface WalletResponse {
  availableCreditsCents: number;
  availableCreditsUsd: string;
  pendingCreditsCents: number;
  pendingCreditsUsd: string;
  minSponsoredBalanceCents: number;
  minSponsoredBalanceUsd: string;
  safetyMarginPercent: number;
  maxSponsoredCostPerRequestCents: number;
  routePreview: RouteMode;
}

export interface SettingsResponse {
  tokenOptimizationMode: OptimizationMode;
  country: string;
  adsEnabled: boolean;
  minSponsoredBalanceCents: number;
  minSponsoredBalanceUsd: string;
  safetyMarginPercent: number;
  maxSponsoredCostPerRequestCents: number;
}

export interface AuthLoginResponse {
  sessionToken: string;
  user: {
    id: string;
    email: string;
  };
  wallet: WalletResponse;
  settings: SettingsResponse;
}

export interface SafeAdContext {
  placement: "ai_waiting_screen";
  tool: "vscode";
  route: RouteMode;
  category: "developer_tools";
  country: string;
  sessionId: string;
}

export interface SponsorCard {
  adId: string;
  campaignId: string;
  providerName: string;
  headline: string;
  body: string;
  cta: string;
  href: string;
  sponsoredBy: string;
  creditCents: number;
}

export interface AdRequestPayload {
  route: RouteMode;
  sessionId: string;
  country?: string;
}

export interface AdRequestResponse {
  adsEnabled: boolean;
  message: string;
  ad: SponsorCard | null;
}

export interface AdImpressionPayload {
  adId: string;
  campaignId: string;
  providerName: string;
  sessionId: string;
}

export interface AdClickPayload {
  adId: string;
  campaignId: string;
  providerName: string;
  href: string;
}

export interface CreditsValidationResponse {
  processed: number;
  confirmed: number;
  rejected: number;
  wallet: WalletResponse;
}

export interface AdHistoryItem {
  id: string;
  providerName: string;
  campaignId: string;
  headline: string;
  creditCents: number;
  creditUsd: string;
  status: ImpressionStatus;
  createdAt: string;
  validatedAt: string | null;
}

export interface AdHistoryResponse {
  items: AdHistoryItem[];
}

export interface SettingsUpdateRequest {
  tokenOptimizationMode?: OptimizationMode;
  country?: string;
  adsEnabled?: boolean;
}

export interface EstimateRequest {
  prompt: string;
  mode?: OptimizationMode;
  model?: string;
}

export interface EstimateResponse {
  route: RouteMode;
  reason: string;
  originalTokens: number;
  optimizedTokens: number;
  estimatedSavingsPercent: number;
  estimatedCostCents: number;
  estimatedCostUsd: string;
  requiredBalanceCents: number;
  requiredBalanceUsd: string;
  availableCreditsCents: number;
  availableCreditsUsd: string;
  optimizationMode: OptimizationMode;
  optimizationNotes: string[];
}

export interface SponsoredRequestPayload extends EstimateRequest {
  sessionId: string;
}

export interface SponsoredRequestResponse {
  route: "sponsored";
  requestId: string;
  model: string;
  text: string;
  originalTokens: number;
  optimizedTokens: number;
  estimatedCostCents: number;
  actualCostCents: number;
  refundedCents: number;
  wallet: WalletResponse;
}

export interface RequestHistoryItem {
  id: string;
  route: RouteMode;
  status: AiRequestStatus;
  model: string;
  promptPreview: string;
  responsePreview: string;
  estimatedCostCents: number;
  estimatedCostUsd: string;
  actualCostCents: number;
  actualCostUsd: string;
  originalTokens: number;
  optimizedTokens: number;
  createdAt: string;
}

export interface RequestHistoryResponse {
  items: RequestHistoryItem[];
}

export interface RouteDecision {
  route: RouteMode;
  requiredBalanceCents: number;
  reason: string;
}

export const ROUTING_POLICY = {
  MIN_SPONSORED_BALANCE_CENTS: 50,
  SAFETY_MARGIN_PERCENT: 0.35,
  MAX_SPONSORED_COST_PER_REQUEST_CENTS: 20
} as const;

export function formatUsdFromCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function estimateTokenCount(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return Math.max(1, Math.ceil(trimmed.length / 4));
}

export function previewText(text: string, maxLength = 140): string {
  const flattened = text.replace(/\s+/g, " ").trim();
  if (flattened.length <= maxLength) return flattened;
  return `${flattened.slice(0, maxLength - 3)}...`;
}

export function decideRoute(input: {
  availableCreditsCents: number;
  estimatedCostCents: number;
  minSponsoredBalanceCents?: number;
  safetyMarginPercent?: number;
  maxSponsoredCostPerRequestCents?: number;
}): RouteDecision {
  const minSponsoredBalanceCents =
    input.minSponsoredBalanceCents ?? ROUTING_POLICY.MIN_SPONSORED_BALANCE_CENTS;
  const safetyMarginPercent =
    input.safetyMarginPercent ?? ROUTING_POLICY.SAFETY_MARGIN_PERCENT;
  const maxSponsoredCostPerRequestCents =
    input.maxSponsoredCostPerRequestCents
    ?? ROUTING_POLICY.MAX_SPONSORED_COST_PER_REQUEST_CENTS;

  if (input.availableCreditsCents < minSponsoredBalanceCents) {
    return {
      route: "official",
      requiredBalanceCents: minSponsoredBalanceCents,
      reason: "Minimum sponsored balance not reached."
    };
  }

  if (input.estimatedCostCents > maxSponsoredCostPerRequestCents) {
    return {
      route: "official",
      requiredBalanceCents: input.estimatedCostCents,
      reason: "Estimated request cost exceeds the sponsored per-request cap."
    };
  }

  const requiredBalanceCents = Math.ceil(
    input.estimatedCostCents * (1 + safetyMarginPercent)
  );
  if (requiredBalanceCents > input.availableCreditsCents) {
    return {
      route: "official",
      requiredBalanceCents,
      reason: "Available credits do not cover the estimated cost plus safety margin."
    };
  }

  return {
    route: "sponsored",
    requiredBalanceCents,
    reason: "Sponsored credits cover the request estimate and safety margin."
  };
}

export function summarizeRoutePreview(availableCreditsCents: number): RouteMode {
  return availableCreditsCents >= ROUTING_POLICY.MIN_SPONSORED_BALANCE_CENTS
    ? "sponsored"
    : "official";
}
