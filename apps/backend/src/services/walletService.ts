import {
  BalanceBucket,
  LedgerEntryType,
  PrismaClient,
  TokenOptimizationMode
} from "@prisma/client";
import {
  ROUTING_POLICY,
  formatUsdFromCents,
  summarizeRoutePreview,
  type OptimizationMode,
  type SettingsResponse,
  type SettingsUpdateRequest,
  type WalletResponse
} from "@atacredits/shared";

function fromPrismaMode(mode: TokenOptimizationMode): OptimizationMode {
  switch (mode) {
    case "CONSERVATIVE":
      return "conservative";
    case "OFF":
      return "off";
    default:
      return "recommended";
  }
}

function toPrismaMode(mode: OptimizationMode): TokenOptimizationMode {
  switch (mode) {
    case "conservative":
      return "CONSERVATIVE";
    case "off":
      return "OFF";
    default:
      return "RECOMMENDED";
  }
}

export class WalletService {
  constructor(private readonly prisma: PrismaClient) {}

  async ensureUserResources(userId: string): Promise<void> {
    await this.prisma.wallet.upsert({
      where: { userId },
      update: {},
      create: { userId }
    });

    await this.prisma.userSettings.upsert({
      where: { userId },
      update: {},
      create: {
        userId,
        tokenOptimizationMode: "RECOMMENDED",
        country: "unknown",
        adsEnabled: true,
        minSponsoredBalanceCents: ROUTING_POLICY.MIN_SPONSORED_BALANCE_CENTS,
        safetyMarginPercent: ROUTING_POLICY.SAFETY_MARGIN_PERCENT,
        maxSponsoredCostPerRequestCents: ROUTING_POLICY.MAX_SPONSORED_COST_PER_REQUEST_CENTS
      }
    });
  }

  async getSettings(userId: string): Promise<SettingsResponse> {
    await this.ensureUserResources(userId);
    const settings = await this.prisma.userSettings.findUniqueOrThrow({
      where: { userId }
    });
    return {
      tokenOptimizationMode: fromPrismaMode(settings.tokenOptimizationMode),
      country: settings.country,
      adsEnabled: settings.adsEnabled,
      minSponsoredBalanceCents: settings.minSponsoredBalanceCents,
      minSponsoredBalanceUsd: formatUsdFromCents(settings.minSponsoredBalanceCents),
      safetyMarginPercent: settings.safetyMarginPercent,
      maxSponsoredCostPerRequestCents: settings.maxSponsoredCostPerRequestCents
    };
  }

  async updateSettings(
    userId: string,
    input: SettingsUpdateRequest
  ): Promise<SettingsResponse> {
    await this.ensureUserResources(userId);
    await this.prisma.userSettings.update({
      where: { userId },
      data: {
        tokenOptimizationMode:
          input.tokenOptimizationMode === undefined
            ? undefined
            : toPrismaMode(input.tokenOptimizationMode),
        country: input.country,
        adsEnabled: input.adsEnabled
      }
    });
    return this.getSettings(userId);
  }

  async getWallet(userId: string): Promise<WalletResponse> {
    const [entries, settings] = await Promise.all([
      this.prisma.creditLedger.findMany({ where: { userId } }),
      this.getSettings(userId)
    ]);

    const availableCreditsCents = entries
      .filter((entry) => entry.balanceBucket === BalanceBucket.AVAILABLE)
      .reduce((total, entry) => total + entry.amountCents, 0);
    const pendingCreditsCents = entries
      .filter(
        (entry) =>
          entry.balanceBucket === BalanceBucket.PENDING
          && entry.settledAt === null
      )
      .reduce((total, entry) => total + entry.amountCents, 0);

    return {
      availableCreditsCents,
      availableCreditsUsd: formatUsdFromCents(availableCreditsCents),
      pendingCreditsCents,
      pendingCreditsUsd: formatUsdFromCents(pendingCreditsCents),
      minSponsoredBalanceCents: settings.minSponsoredBalanceCents,
      minSponsoredBalanceUsd: settings.minSponsoredBalanceUsd,
      safetyMarginPercent: settings.safetyMarginPercent,
      maxSponsoredCostPerRequestCents: settings.maxSponsoredCostPerRequestCents,
      routePreview: summarizeRoutePreview(availableCreditsCents)
    };
  }

  async createLedgerEntry(input: {
    userId: string;
    type: LedgerEntryType;
    bucket: BalanceBucket;
    amountCents: number;
    description?: string;
    impressionId?: string;
    aiRequestId?: string;
    metadataJson?: string;
    settledAt?: Date | null;
  }): Promise<{ id: string }> {
    await this.ensureUserResources(input.userId);
    const wallet = await this.prisma.wallet.findUniqueOrThrow({
      where: { userId: input.userId }
    });
    const entry = await this.prisma.creditLedger.create({
      data: {
        walletId: wallet.id,
        userId: input.userId,
        type: input.type,
        balanceBucket: input.bucket,
        amountCents: input.amountCents,
        description: input.description,
        impressionId: input.impressionId,
        aiRequestId: input.aiRequestId,
        metadataJson: input.metadataJson,
        settledAt: input.settledAt ?? null
      }
    });
    return { id: entry.id };
  }

  async addPendingAdCredit(input: {
    userId: string;
    impressionId: string;
    amountCents: number;
  }): Promise<{ id: string }> {
    return this.createLedgerEntry({
      userId: input.userId,
      type: "AD_PENDING_CREDIT",
      bucket: BalanceBucket.PENDING,
      amountCents: input.amountCents,
      impressionId: input.impressionId,
      description: "Pending sponsored ad credit."
    });
  }

  async confirmPendingAdCredit(input: {
    userId: string;
    impressionId: string;
    amountCents: number;
  }): Promise<void> {
    await this.prisma.creditLedger.updateMany({
      where: {
        userId: input.userId,
        impressionId: input.impressionId,
        type: "AD_PENDING_CREDIT",
        settledAt: null
      },
      data: {
        settledAt: new Date()
      }
    });
    await this.createLedgerEntry({
      userId: input.userId,
      type: "AD_CONFIRMED_CREDIT",
      bucket: BalanceBucket.AVAILABLE,
      amountCents: input.amountCents,
      impressionId: input.impressionId,
      description: "Confirmed sponsored ad credit."
    });
  }

  async rejectPendingAdCredit(input: {
    userId: string;
    impressionId: string;
    reason: string;
  }): Promise<void> {
    await this.prisma.creditLedger.updateMany({
      where: {
        userId: input.userId,
        impressionId: input.impressionId,
        type: "AD_PENDING_CREDIT",
        settledAt: null
      },
      data: {
        settledAt: new Date()
      }
    });
    await this.createLedgerEntry({
      userId: input.userId,
      type: "AD_REJECTED",
      bucket: BalanceBucket.AVAILABLE,
      amountCents: 0,
      impressionId: input.impressionId,
      description: input.reason,
      settledAt: new Date()
    });
  }

  async reserveSponsoredCredits(input: {
    userId: string;
    aiRequestId: string;
    amountCents: number;
  }): Promise<void> {
    await this.createLedgerEntry({
      userId: input.userId,
      type: "AI_REQUEST_RESERVE",
      bucket: BalanceBucket.AVAILABLE,
      amountCents: -input.amountCents,
      aiRequestId: input.aiRequestId,
      description: "Sponsored request reserve."
    });
  }

  async captureSponsoredCredits(input: {
    userId: string;
    aiRequestId: string;
    amountCents: number;
  }): Promise<void> {
    await this.createLedgerEntry({
      userId: input.userId,
      type: "AI_REQUEST_CAPTURE",
      bucket: BalanceBucket.AVAILABLE,
      amountCents: 0,
      aiRequestId: input.aiRequestId,
      metadataJson: JSON.stringify({ actualCostCents: input.amountCents }),
      description: "Sponsored request capture.",
      settledAt: new Date()
    });
  }

  async refundSponsoredCredits(input: {
    userId: string;
    aiRequestId: string;
    amountCents: number;
  }): Promise<void> {
    if (input.amountCents <= 0) return;
    await this.createLedgerEntry({
      userId: input.userId,
      type: "AI_REQUEST_REFUND",
      bucket: BalanceBucket.AVAILABLE,
      amountCents: input.amountCents,
      aiRequestId: input.aiRequestId,
      description: "Sponsored request refund."
    });
  }
}
