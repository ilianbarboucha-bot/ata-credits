import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { PrismaClient } from "@prisma/client";
import { buildApp } from "../src/app.js";

function runPrismaPush(databaseUrl: string) {
  const scriptPath = join(process.cwd(), "..", "..", "scripts", "db-push.mjs");
  execFileSync(process.execPath, [scriptPath], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl
    },
    stdio: "ignore"
  });
}

test("login, ads and sponsored request flow", async () => {
  const tempDir = mkdtempSync(join(tmpdir(), "ata-credits-test-"));
  const databaseUrl = `file:${join(tempDir, "test.db").replace(/\\/g, "/")}`;
  runPrismaPush(databaseUrl);

  process.env.DATABASE_URL = databaseUrl;
  const prisma = new PrismaClient();
  const app = await buildApp(prisma, {
    port: 0,
    defaultCountry: "fr",
    sponsoredGatewayModel: "test-model"
  });

  try {
    const loginResponse = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: {
        email: "test@example.com"
      }
    });
    assert.equal(loginResponse.statusCode, 200);
    const loginBody = loginResponse.json();
    const token = loginBody.sessionToken as string;
    const userId = loginBody.user.id as string;

    const wallet = await prisma.wallet.findUniqueOrThrow({ where: { userId } });
    await prisma.creditLedger.create({
      data: {
        walletId: wallet.id,
        userId,
        type: "MANUAL_ADJUSTMENT",
        balanceBucket: "AVAILABLE",
        amountCents: 80,
        description: "Seed test credits."
      }
    });

    const adResponse = await app.inject({
      method: "POST",
      url: "/ads/request",
      headers: {
        authorization: `Bearer ${token}`
      },
      payload: {
        route: "official",
        sessionId: "session-test"
      }
    });
    assert.equal(adResponse.statusCode, 200);
    const adBody = adResponse.json();
    assert.equal(adBody.adsEnabled, true);
    assert.equal(typeof adBody.message, "string");
    assert.notEqual(adBody.ad, null);
    assert.equal(typeof adBody.ad.adId, "string");

    const estimateResponse = await app.inject({
      method: "POST",
      url: "/ai/estimate",
      headers: {
        authorization: `Bearer ${token}`
      },
      payload: {
        prompt: "Summarize this backlog into a shippable implementation plan."
      }
    });
    assert.equal(estimateResponse.statusCode, 200);
    const estimateBody = estimateResponse.json();
    assert.equal(estimateBody.route, "sponsored");

    const sponsoredResponse = await app.inject({
      method: "POST",
      url: "/ai/sponsored-request",
      headers: {
        authorization: `Bearer ${token}`
      },
      payload: {
        prompt: "Summarize this backlog into a shippable implementation plan.",
        sessionId: "session-test"
      }
    });
    assert.equal(sponsoredResponse.statusCode, 200);
    const sponsoredBody = sponsoredResponse.json();
    assert.equal(sponsoredBody.route, "sponsored");
    assert.equal(typeof sponsoredBody.text, "string");

    const storedRequest = await prisma.aiRequest.findFirstOrThrow({
      where: { userId },
      orderBy: { createdAt: "desc" }
    });
    assert.equal(storedRequest.promptPreview, "Prompt hidden by privacy default.");
    assert.equal(typeof storedRequest.metadataJson, "string");
  } finally {
    await app.close();
    await prisma.$disconnect();
  }
});

test("ads can be disabled from settings and no sponsor card is returned", async () => {
  const tempDir = mkdtempSync(join(tmpdir(), "ata-credits-test-"));
  const databaseUrl = `file:${join(tempDir, "test.db").replace(/\\/g, "/")}`;
  runPrismaPush(databaseUrl);

  process.env.DATABASE_URL = databaseUrl;
  const prisma = new PrismaClient();
  const app = await buildApp(prisma, {
    port: 0,
    defaultCountry: "fr",
    sponsoredGatewayModel: "test-model"
  });

  try {
    const loginResponse = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: {
        email: "ads-off@example.com",
        provider: "google_mock"
      }
    });
    assert.equal(loginResponse.statusCode, 200);
    const token = loginResponse.json().sessionToken as string;

    const settingsResponse = await app.inject({
      method: "POST",
      url: "/settings",
      headers: {
        authorization: `Bearer ${token}`
      },
      payload: {
        adsEnabled: false,
        country: "fr"
      }
    });
    assert.equal(settingsResponse.statusCode, 200);
    assert.equal(settingsResponse.json().adsEnabled, false);

    const adResponse = await app.inject({
      method: "POST",
      url: "/ads/request",
      headers: {
        authorization: `Bearer ${token}`
      },
      payload: {
        route: "official",
        sessionId: "ads-disabled"
      }
    });
    assert.equal(adResponse.statusCode, 200);
    assert.equal(adResponse.json().adsEnabled, false);
    assert.equal(adResponse.json().ad, null);

    const impressionResponse = await app.inject({
      method: "POST",
      url: "/ads/impression",
      headers: {
        authorization: `Bearer ${token}`
      },
      payload: {
        adId: "disabled",
        campaignId: "disabled",
        providerName: "house",
        sessionId: "ads-disabled"
      }
    });
    assert.equal(impressionResponse.statusCode, 409);
    assert.equal(impressionResponse.json().error, "ADS_DISABLED");
  } finally {
    await app.close();
    await prisma.$disconnect();
  }
});

test("suspicious repeated impressions are blocked after repeated abuse", async () => {
  const tempDir = mkdtempSync(join(tmpdir(), "ata-credits-test-"));
  const databaseUrl = `file:${join(tempDir, "test.db").replace(/\\/g, "/")}`;
  runPrismaPush(databaseUrl);

  process.env.DATABASE_URL = databaseUrl;
  const prisma = new PrismaClient();
  const app = await buildApp(prisma, {
    port: 0,
    defaultCountry: "fr",
    sponsoredGatewayModel: "test-model"
  });

  try {
    const loginResponse = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: {
        email: "fraud@example.com"
      }
    });
    const loginBody = loginResponse.json();
    const token = loginBody.sessionToken as string;

    const adResponse = await app.inject({
      method: "POST",
      url: "/ads/request",
      headers: {
        authorization: `Bearer ${token}`
      },
      payload: {
        route: "official",
        sessionId: "session-fraud"
      }
    });
    const adBody = adResponse.json();
    assert.notEqual(adBody.ad, null);

    for (let attempt = 0; attempt < 4; attempt += 1) {
      const response = await app.inject({
        method: "POST",
        url: "/ads/impression",
        headers: {
          authorization: `Bearer ${token}`
        },
        payload: {
          adId: adBody.ad.adId,
          campaignId: adBody.ad.campaignId,
          providerName: adBody.ad.providerName,
          sessionId: "session-fraud"
        }
      });
      assert.equal(response.statusCode, 200);
    }

    const blockedResponse = await app.inject({
      method: "POST",
      url: "/ads/impression",
      headers: {
        authorization: `Bearer ${token}`
      },
      payload: {
        adId: adBody.ad.adId,
        campaignId: adBody.ad.campaignId,
        providerName: adBody.ad.providerName,
        sessionId: "session-fraud"
      }
    });
    assert.equal(blockedResponse.statusCode, 403);
    assert.equal(blockedResponse.json().error, "SUSPICIOUS_ACTIVITY_BLOCKED");
  } finally {
    await app.close();
    await prisma.$disconnect();
  }
});

test("validated impressions can recharge the same session again", async () => {
  const tempDir = mkdtempSync(join(tmpdir(), "ata-credits-test-"));
  const databaseUrl = `file:${join(tempDir, "test.db").replace(/\\/g, "/")}`;
  runPrismaPush(databaseUrl);

  process.env.DATABASE_URL = databaseUrl;
  const prisma = new PrismaClient();
  const app = await buildApp(prisma, {
    port: 0,
    defaultCountry: "fr",
    sponsoredGatewayModel: "test-model"
  });

  try {
    const loginResponse = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "repeat-ok@example.com" }
    });
    const token = loginResponse.json().sessionToken as string;

    const requestAd = async () => app.inject({
      method: "POST",
      url: "/ads/request",
      headers: {
        authorization: `Bearer ${token}`
      },
      payload: {
        route: "official",
        sessionId: "session-repeat-ok"
      }
    });

    const firstAd = (await requestAd()).json().ad;
    assert.notEqual(firstAd, null);
    const firstImpression = await app.inject({
      method: "POST",
      url: "/ads/impression",
      headers: {
        authorization: `Bearer ${token}`
      },
      payload: {
        adId: firstAd.adId,
        campaignId: firstAd.campaignId,
        providerName: firstAd.providerName,
        sessionId: "session-repeat-ok"
      }
    });
    assert.equal(firstImpression.statusCode, 200);

    await prisma.adImpression.updateMany({
      where: {
        sessionId: "session-repeat-ok",
        adId: firstAd.adId
      },
      data: {
        createdAt: new Date(Date.now() - 10_000)
      }
    });

    const validateResponse = await app.inject({
      method: "POST",
      url: "/credits/validate",
      headers: {
        authorization: `Bearer ${token}`
      }
    });
    assert.equal(validateResponse.statusCode, 200);

    const secondAd = (await requestAd()).json().ad;
    const secondImpression = await app.inject({
      method: "POST",
      url: "/ads/impression",
      headers: {
        authorization: `Bearer ${token}`
      },
      payload: {
        adId: secondAd.adId,
        campaignId: secondAd.campaignId,
        providerName: secondAd.providerName,
        sessionId: "session-repeat-ok"
      }
    });
    assert.equal(secondImpression.statusCode, 200);
    assert.equal(secondImpression.json().status, "PENDING");
  } finally {
    await app.close();
    await prisma.$disconnect();
  }
});
