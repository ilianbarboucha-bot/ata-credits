import type { SafeAdContext, SponsorCard } from "@atacredits/shared";

export interface AdProvider {
  name: string;
  fetchAd(context: SafeAdContext): Promise<SponsorCard | null>;
  trackImpression(_ad: SponsorCard): Promise<void>;
  trackClick(_ad: SponsorCard): Promise<void>;
}

interface CampaignSeed {
  id: string;
  providerName: string;
  name: string;
  headline: string;
  body: string;
  cta: string;
  href: string;
  sponsoredBy: string;
  creditCents: number;
  fillRate: number;
}

export const defaultSponsorCampaigns: CampaignSeed[] = [
  {
    id: "direct_devinfra",
    providerName: "direct",
    name: "DevInfra Cost Guard",
    headline: "Cap your CI bill before it caps your velocity.",
    body: "Usage dashboards for build-heavy teams.",
    cta: "See stack",
    href: "https://example.com/direct/devinfra",
    sponsoredBy: "Direct Sponsor",
    creditCents: 18,
    fillRate: 0.95
  },
  {
    id: "direct_repohealth",
    providerName: "direct",
    name: "Repo Health Radar",
    headline: "Keep pull requests fast and dependency drift visible.",
    body: "Signals for engineering managers who need fewer surprises.",
    cta: "Open brief",
    href: "https://example.com/direct/repohealth",
    sponsoredBy: "Direct Sponsor",
    creditCents: 16,
    fillRate: 0.9
  },
  {
    id: "idlen_waitbudget",
    providerName: "idlen",
    name: "Idlen Build Sponsor",
    headline: "Turn build wait into sponsor-funded credits.",
    body: "Mock integration for Idlen demand.",
    cta: "Learn more",
    href: "https://example.com/idlen",
    sponsoredBy: "Idlen",
    creditCents: 14,
    fillRate: 0.7
  },
  {
    id: "thrad_stackops",
    providerName: "thrad",
    name: "Thrad Cloud Ops",
    headline: "Serverless tracing without mystery invoices.",
    body: "Mock integration for Thrad demand.",
    cta: "Preview",
    href: "https://example.com/thrad",
    sponsoredBy: "Thrad",
    creditCents: 12,
    fillRate: 0.55
  },
  {
    id: "adgentek_codeassist",
    providerName: "adgentek",
    name: "Adgentek Code Assist",
    headline: "Sponsor marketplace for developer tools.",
    body: "Mock integration for Adgentek demand.",
    cta: "Details",
    href: "https://example.com/adgentek",
    sponsoredBy: "Adgentek",
    creditCents: 10,
    fillRate: 0.45
  },
  {
    id: "house_privacy",
    providerName: "house",
    name: "ATA Credits Privacy",
    headline: "Ads fund the request, but ads never see the request.",
    body: "House ad fallback when no network fills.",
    cta: "Privacy",
    href: "https://example.com/privacy",
    sponsoredBy: "ATA Credits",
    creditCents: 6,
    fillRate: 1
  }
];

function hashValue(input: string): number {
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = ((hash << 5) - hash) + input.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash);
}

function selectCampaign(providerName: string): CampaignSeed[] {
  return defaultSponsorCampaigns.filter((campaign) => campaign.providerName === providerName);
}

abstract class BaseMockProvider implements AdProvider {
  abstract readonly name: string;

  constructor(private readonly fillRate: number) {}

  protected abstract campaigns(): CampaignSeed[];

  async fetchAd(context: SafeAdContext): Promise<SponsorCard | null> {
    const providerName = this.name as CampaignSeed["providerName"];
    const score = (hashValue(`${providerName}:${context.sessionId}`) % 100) / 100;
    if (score > this.fillRate && providerName !== "house") {
      return null;
    }

    const campaigns = this.campaigns();
    const index = hashValue(`${context.sessionId}:${providerName}:${context.route}`)
      % campaigns.length;
    const selected = campaigns[index];
    return {
      adId: `${providerName}_${selected.id}`,
      campaignId: selected.id,
      providerName,
      headline: selected.headline,
      body:
        context.route === "official"
          ? `${selected.body} Recharge continues while your normal setup runs.`
          : `${selected.body} This request can be covered by sponsored credits.`,
      cta: selected.cta,
      href: selected.href,
      sponsoredBy: selected.sponsoredBy,
      creditCents: selected.creditCents
    };
  }

  async trackImpression(): Promise<void> {}

  async trackClick(): Promise<void> {}
}

// TODO: replace with real direct-sponsor ingestion and callbacks.
export class DirectSponsorProvider extends BaseMockProvider {
  readonly name = "direct";
  constructor() {
    super(0.95);
  }
  protected campaigns(): CampaignSeed[] {
    return selectCampaign(this.name);
  }
}

// TODO: replace with the real Idlen integration.
export class IdlenProvider extends BaseMockProvider {
  readonly name = "idlen";
  constructor() {
    super(0.7);
  }
  protected campaigns(): CampaignSeed[] {
    return selectCampaign(this.name);
  }
}

// TODO: replace with the real Thrad integration.
export class ThradProvider extends BaseMockProvider {
  readonly name = "thrad";
  constructor() {
    super(0.55);
  }
  protected campaigns(): CampaignSeed[] {
    return selectCampaign(this.name);
  }
}

// TODO: replace with the real Adgentek integration.
export class AdgentekProvider extends BaseMockProvider {
  readonly name = "adgentek";
  constructor() {
    super(0.45);
  }
  protected campaigns(): CampaignSeed[] {
    return selectCampaign(this.name);
  }
}

export class HouseAdProvider extends BaseMockProvider {
  readonly name = "house";
  constructor() {
    super(1);
  }
  protected campaigns(): CampaignSeed[] {
    return selectCampaign(this.name);
  }
}

export class AdMediationService {
  constructor(private readonly providers: AdProvider[]) {}

  async requestAd(context: SafeAdContext): Promise<SponsorCard> {
    for (const provider of this.providers) {
      const ad = await provider.fetchAd(context);
      if (ad) return ad;
    }

    throw new Error("House ad provider missing from waterfall.");
  }
}

export function createDefaultAdProviders(): AdProvider[] {
  return [
    new DirectSponsorProvider(),
    new IdlenProvider(),
    new ThradProvider(),
    new AdgentekProvider(),
    new HouseAdProvider()
  ];
}
