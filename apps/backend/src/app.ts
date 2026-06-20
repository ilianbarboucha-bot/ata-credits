import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import cors from "@fastify/cors";
import { PrismaClient } from "@prisma/client";
import type { BackendEnv } from "./env.js";
import { AuthService } from "./services/authService.js";
import { WalletService } from "./services/walletService.js";
import { AdService } from "./services/adService.js";
import { AiService, InsufficientSponsoredCreditsError } from "./services/aiService.js";
import { SimpleRateLimiter } from "./services/rateLimiter.js";

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function isString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function readBearerToken(headers: Record<string, unknown>): string | null {
  const raw = headers.authorization;
  if (typeof raw !== "string") return null;
  const match = raw.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? null;
}

async function requireUserId(
  request: FastifyRequest,
  reply: FastifyReply,
  authService: AuthService
): Promise<string | null> {
  const token = readBearerToken(request.headers as Record<string, unknown>);
  if (!token) {
    await reply.code(401).send({ error: "AUTH_REQUIRED" });
    return null;
  }
  const userId = await authService.getUserIdFromToken(token);
  if (!userId) {
    await reply.code(401).send({ error: "INVALID_SESSION" });
    return null;
  }
  return userId;
}

export async function buildApp(prisma: PrismaClient, env: BackendEnv) {
  const app = Fastify({ logger: true });
  await app.register(cors, { origin: true });

  const walletService = new WalletService(prisma);
  const authService = new AuthService(prisma, walletService);
  const limiter = new SimpleRateLimiter();
  const adService = new AdService(prisma, walletService, limiter, env.defaultCountry);
  const aiService = new AiService(prisma, walletService, env.sponsoredGatewayModel);
  await adService.seedCampaigns();

  app.get("/health", async () => ({
    ok: true,
    service: "ata-credits-backend"
  }));

  app.post("/auth/login", async (request, reply) => {
    if (!isObject(request.body) || !isString(request.body.email)) {
      return reply.code(400).send({ error: "INVALID_BODY" });
    }
    return authService.login({
      email: request.body.email,
      provider: request.body.provider === "google_mock" ? "google_mock" : "email_magic_link"
    });
  });

  app.get("/wallet", async (request, reply) => {
    const userId = await requireUserId(request, reply, authService);
    if (!userId) return;
    return walletService.getWallet(userId);
  });

  app.post("/ads/request", async (request, reply) => {
    const userId = await requireUserId(request, reply, authService);
    if (!userId) return;
    if (
      !isObject(request.body)
      || !isString(request.body.route)
      || !isString(request.body.sessionId)
    ) {
      return reply.code(400).send({ error: "INVALID_BODY" });
    }
    return adService.requestAd(userId, {
      route: request.body.route === "sponsored" ? "sponsored" : "official",
      sessionId: request.body.sessionId,
      country: isString(request.body.country) ? request.body.country : undefined
    });
  });

  app.post("/ads/impression", async (request, reply) => {
    const userId = await requireUserId(request, reply, authService);
    if (!userId) return;
    if (
      !isObject(request.body)
      || !isString(request.body.adId)
      || !isString(request.body.campaignId)
      || !isString(request.body.providerName)
      || !isString(request.body.sessionId)
    ) {
      return reply.code(400).send({ error: "INVALID_BODY" });
    }
    try {
      return await adService.trackImpression(userId, {
        adId: request.body.adId,
        campaignId: request.body.campaignId,
        providerName: request.body.providerName,
        sessionId: request.body.sessionId
      });
    } catch (error) {
      if (error instanceof Error && error.message === "ADS_DISABLED") {
        return reply.code(409).send({ error: "ADS_DISABLED" });
      }
      if (error instanceof Error && error.message === "RATE_LIMITED") {
        return reply.code(429).send({ error: "RATE_LIMITED" });
      }
      if (error instanceof Error && error.message === "SUSPICIOUS_BLOCKED") {
        return reply.code(403).send({ error: "SUSPICIOUS_ACTIVITY_BLOCKED" });
      }
      throw error;
    }
  });

  app.post("/ads/click", async (request, reply) => {
    const userId = await requireUserId(request, reply, authService);
    if (!userId) return;
    if (
      !isObject(request.body)
      || !isString(request.body.adId)
      || !isString(request.body.campaignId)
      || !isString(request.body.providerName)
      || !isString(request.body.href)
    ) {
      return reply.code(400).send({ error: "INVALID_BODY" });
    }
    try {
      await adService.trackClick(userId, {
        adId: request.body.adId,
        campaignId: request.body.campaignId,
        providerName: request.body.providerName,
        href: request.body.href
      });
      return { ok: true };
    } catch (error) {
      if (error instanceof Error && error.message === "ADS_DISABLED") {
        return reply.code(409).send({ error: "ADS_DISABLED" });
      }
      if (error instanceof Error && error.message === "RATE_LIMITED") {
        return reply.code(429).send({ error: "RATE_LIMITED" });
      }
      throw error;
    }
  });

  app.post("/credits/validate", async (request, reply) => {
    const userId = await requireUserId(request, reply, authService);
    if (!userId) return;
    return adService.validateCredits(userId);
  });

  app.post("/ai/estimate", async (request, reply) => {
    const userId = await requireUserId(request, reply, authService);
    if (!userId) return;
    if (!isObject(request.body) || !isString(request.body.prompt)) {
      return reply.code(400).send({ error: "INVALID_BODY" });
    }
    return aiService.estimate(userId, {
      prompt: request.body.prompt,
      mode: request.body.mode === "off" || request.body.mode === "conservative"
        ? request.body.mode
        : "recommended",
      model: isString(request.body.model) ? request.body.model : undefined
    });
  });

  app.post("/ai/sponsored-request", async (request, reply) => {
    const userId = await requireUserId(request, reply, authService);
    if (!userId) return;
    if (
      !isObject(request.body)
      || !isString(request.body.prompt)
      || !isString(request.body.sessionId)
    ) {
      return reply.code(400).send({ error: "INVALID_BODY" });
    }

    try {
      return await aiService.sponsoredRequest(userId, {
        prompt: request.body.prompt,
        sessionId: request.body.sessionId,
        mode: request.body.mode === "off" || request.body.mode === "conservative"
          ? request.body.mode
          : "recommended",
        model: isString(request.body.model) ? request.body.model : undefined
      });
    } catch (error) {
      if (error instanceof InsufficientSponsoredCreditsError) {
        return reply.code(409).send({
          error: "INSUFFICIENT_SPONSORED_CREDITS",
          estimate: error.estimate
        });
      }
      throw error;
    }
  });

  app.post("/ai/official-log", async (request, reply) => {
    const userId = await requireUserId(request, reply, authService);
    if (!userId) return;
    if (
      !isObject(request.body)
      || !isString(request.body.prompt)
      || !isString(request.body.responseText)
      || !isObject(request.body.estimate)
    ) {
      return reply.code(400).send({ error: "INVALID_BODY" });
    }
    await aiService.logOfficialRequest({
      userId,
      prompt: request.body.prompt,
      responseText: request.body.responseText,
      model: isString(request.body.model) ? request.body.model : "local-official-demo",
      estimate: request.body.estimate as never
    });
    return { ok: true };
  });

  app.get("/history/requests", async (request, reply) => {
    const userId = await requireUserId(request, reply, authService);
    if (!userId) return;
    return aiService.getHistory(userId);
  });

  app.get("/history/ads", async (request, reply) => {
    const userId = await requireUserId(request, reply, authService);
    if (!userId) return;
    return adService.getHistory(userId);
  });

  app.get("/settings", async (request, reply) => {
    const userId = await requireUserId(request, reply, authService);
    if (!userId) return;
    return walletService.getSettings(userId);
  });

  app.post("/settings", async (request, reply) => {
    const userId = await requireUserId(request, reply, authService);
    if (!userId) return;
    if (!isObject(request.body)) {
      return reply.code(400).send({ error: "INVALID_BODY" });
    }
    return walletService.updateSettings(userId, {
      tokenOptimizationMode:
        request.body.tokenOptimizationMode === "off"
        || request.body.tokenOptimizationMode === "conservative"
        || request.body.tokenOptimizationMode === "recommended"
          ? request.body.tokenOptimizationMode
          : undefined,
      country: isString(request.body.country) ? request.body.country : undefined,
      adsEnabled:
        typeof request.body.adsEnabled === "boolean"
          ? request.body.adsEnabled
          : undefined
    });
  });

  return app;
}
