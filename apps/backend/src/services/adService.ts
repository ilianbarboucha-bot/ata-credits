import { PrismaClient } from "@prisma/client";
import {
  AdMediationService,
  createDefaultAdProviders,
  defaultSponsorCampaigns
} from "@atacredits/ad-providers";
import {
  formatUsdFromCents,
  type AdHistoryResponse,
  type AdImpressionPayload,
  type AdRequestPayload,
  type AdRequestResponse,
  type AdClickPayload,
  type CreditsValidationResponse
} from "@atacredits/shared";
import { SimpleRateLimiter } from "./rateLimiter.js";
import { WalletService } from "./walletService.js";

export class AdService {
  private readonly mediation = new AdMediationService(createDefaultAdProviders());

  constructor(
    private readonly prisma: PrismaClient,
    private readonly walletService: WalletService,
    private readonly limiter: SimpleRateLimiter,
    private readonly defaultCountry: string
  ) {}

  async seedCampaigns(): Promise<void> {
    for (const campaign of defaultSponsorCampaigns) {
      await this.prisma.sponsorCampaign.upsert({
        where: { id: campaign.id },
        update: {
          providerName: campaign.providerName,
          name: campaign.name,
          headline: campaign.headline,
          body: campaign.body,
          cta: campaign.cta,
          href: campaign.href,
          sponsoredBy: campaign.sponsoredBy,
          defaultCreditCents: campaign.creditCents,
          active: true
        },
        create: {
          id: campaign.id,
          providerName: campaign.providerName,
          name: campaign.name,
          headline: campaign.headline,
          body: campaign.body,
          cta: campaign.cta,
          href: campaign.href,
          sponsoredBy: campaign.sponsoredBy,
          defaultCreditCents: campaign.creditCents,
          active: true
        }
      });
    }
  }

  async requestAd(userId: string, input: AdRequestPayload): Promise<AdRequestResponse> {
    const settings = await this.walletService.getSettings(userId);
    if (!settings.adsEnabled) {
      return {
        adsEnabled: false,
        message: "Ads are disabled. Recharge is paused until ads are enabled again.",
        ad: null
      };
    }

    const ad = await this.mediation.requestAd({
      placement: "ai_waiting_screen",
      tool: "vscode",
      route: input.route,
      category: "developer_tools",
      country: input.country ?? settings.country ?? this.defaultCountry,
      sessionId: input.sessionId
    });
    return {
      adsEnabled: true,
      message: "Sponsor card loaded for this AI wait.",
      ad
    };
  }

  async trackImpression(userId: string, input: AdImpressionPayload): Promise<{
    impressionId: string;
    status: string;
  }> {
    await this.assertAdsEnabled(userId);
    this.limiter.assertWithinLimit(`impression:${userId}`, 12, 60_000);
    this.limiter.assertWithinLimit(`impression-session:${input.sessionId}`, 12, 60_000);

    const campaign = await this.prisma.sponsorCampaign.findUniqueOrThrow({
      where: { id: input.campaignId }
    });
    const lastImpression = await this.prisma.adImpression.findFirst({
      where: { userId },
      orderBy: { createdAt: "desc" }
    });
    const repeatedImpression = await this.prisma.adImpression.findFirst({
      where: {
        userId,
        sessionId: input.sessionId,
        adId: input.adId
      },
      orderBy: { createdAt: "desc" }
    });
    const suspiciousCount = await this.prisma.adImpression.count({
      where: {
        userId,
        sessionId: input.sessionId,
        status: "SUSPICIOUS",
        createdAt: { gte: new Date(Date.now() - 10 * 60_000) }
      }
    });

    if (suspiciousCount >= 3) {
      throw new Error("SUSPICIOUS_BLOCKED");
    }

    let status: "PENDING" | "SUSPICIOUS" = "PENDING";
    let fraudReason: string | null = null;
    if (lastImpression) {
      const deltaMs = Date.now() - lastImpression.createdAt.getTime();
      if (deltaMs < 4_000) {
        status = "SUSPICIOUS";
        fraudReason = "Impressions arrived too quickly.";
      }
    }
    if (
      repeatedImpression
      && (
        repeatedImpression.status === "PENDING"
        || (Date.now() - repeatedImpression.createdAt.getTime()) < 4_000
      )
    ) {
      status = "SUSPICIOUS";
      fraudReason = "Repeated impression for the same ad and session before the prior one settled.";
    }

    const impression = await this.prisma.adImpression.create({
      data: {
        userId,
        campaignId: input.campaignId,
        providerName: input.providerName,
        adId: input.adId,
        placement: "ai_waiting_screen",
        sessionId: input.sessionId,
        headline: campaign.headline,
        creditCents: campaign.defaultCreditCents,
        status,
        fraudReason
      }
    });

    if (status === "PENDING") {
      await this.walletService.addPendingAdCredit({
        userId,
        impressionId: impression.id,
        amountCents: impression.creditCents
      });
    }

    return {
      impressionId: impression.id,
      status
    };
  }

  async trackClick(userId: string, input: AdClickPayload): Promise<void> {
    await this.assertAdsEnabled(userId);
    this.limiter.assertWithinLimit(`click:${userId}`, 30, 60_000);
    this.limiter.assertWithinLimit(`click-session:${input.providerName}:${input.adId}`, 30, 60_000);
    await this.prisma.adClick.create({
      data: {
        userId,
        campaignId: input.campaignId,
        providerName: input.providerName,
        adId: input.adId,
        href: input.href
      }
    });
  }

  async validateCredits(userId: string): Promise<CreditsValidationResponse> {
    const cutoff = new Date(Date.now() - 3_000);
    const pending = await this.prisma.adImpression.findMany({
      where: {
        userId,
        status: "PENDING",
        createdAt: { lte: cutoff }
      },
      orderBy: { createdAt: "asc" }
    });

    let processed = 0;
    let confirmed = 0;
    let rejected = 0;

    for (const impression of pending) {
      processed += 1;
      if (impression.creditCents <= 0) {
        rejected += 1;
        await this.prisma.adImpression.update({
          where: { id: impression.id },
          data: {
            status: "REJECTED",
            validatedAt: new Date(),
            fraudReason: "Invalid impression credit value."
          }
        });
        await this.walletService.rejectPendingAdCredit({
          userId,
          impressionId: impression.id,
          reason: "Rejected pending credit."
        });
        continue;
      }

      confirmed += 1;
      await this.prisma.adImpression.update({
        where: { id: impression.id },
        data: {
          status: "CONFIRMED",
          validatedAt: new Date()
        }
      });
      await this.walletService.confirmPendingAdCredit({
        userId,
        impressionId: impression.id,
        amountCents: impression.creditCents
      });
    }

    return {
      processed,
      confirmed,
      rejected,
      wallet: await this.walletService.getWallet(userId)
    };
  }

  async getHistory(userId: string): Promise<AdHistoryResponse> {
    const impressions = await this.prisma.adImpression.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 20
    });

    return {
      items: impressions.map((impression) => ({
        id: impression.id,
        providerName: impression.providerName,
        campaignId: impression.campaignId,
        headline: impression.headline,
        creditCents: impression.creditCents,
        creditUsd: formatUsdFromCents(impression.creditCents),
        status: impression.status,
        createdAt: impression.createdAt.toISOString(),
        validatedAt: impression.validatedAt?.toISOString() ?? null
      }))
    };
  }

  private async assertAdsEnabled(userId: string): Promise<void> {
    const settings = await this.walletService.getSettings(userId);
    if (!settings.adsEnabled) {
      throw new Error("ADS_DISABLED");
    }
  }
}
