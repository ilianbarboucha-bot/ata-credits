export interface BackendEnv {
  port: number;
  defaultCountry: string;
  sponsoredGatewayModel: string;
}

export function readEnv(): BackendEnv {
  return {
    port: Number.parseInt(process.env.PORT ?? "8787", 10),
    defaultCountry:
      process.env.ATA_CREDITS_DEFAULT_COUNTRY
      ?? process.env.SPONSORCREDITS_DEFAULT_COUNTRY
      ?? "unknown",
    sponsoredGatewayModel:
      process.env.ATA_CREDITS_SPONSORED_GATEWAY_MODEL
      ?? process.env.SPONSORED_GATEWAY_MODEL
      ?? "ata-credits-mock-1"
  };
}
