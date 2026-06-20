# ATA Credits Architecture

## Active Monorepo Surface

The active ATA Credits MVP is intentionally scoped to these workspaces:

- `apps/backend`
- `apps/vscode-extension`
- `packages/shared`
- `packages/ad-providers`
- `packages/token-optimizer`
- `prisma`

The root workspace configuration points only at those paths so the ATA Credits MVP can be built, tested, and packaged without depending on legacy Waitline surfaces.

## Product Boundaries

ATA Credits has two cooperating layers:

1. AI routing
   - decides whether a request runs in `official` mode or through the sponsored gateway;
   - never changes route after a request starts.
2. Sponsored recharge
   - requests a sponsor card during wait time;
   - tracks impressions and clicks;
   - grants credits in `pending` first, then `available` after delayed validation.

These layers deliberately stay separate so `Official` mode can continue recharging credits in parallel.

## `apps/backend`

Fastify + Prisma backend responsible for:

- mock auth and session issuance;
- mock email-magic-link and Google login provider selection;
- wallet and settings reads;
- ad mediation and safe metadata handling;
- impression tracking, delayed validation, and anti-fraud checks;
- request estimation and sponsored gateway execution;
- ledger-backed balance computation;
- privacy-safe request history logging.

### Modules

- `authService`
- `walletService`
- `adService`
- `aiService`
- `requestEstimator`
- `sponsoredGateway`
- `privacyLogging`
- `rateLimiter`

### Endpoints

- `POST /auth/login`
- `GET /wallet`
- `POST /ads/request`
- `POST /ads/impression`
- `POST /ads/click`
- `POST /credits/validate`
- `POST /ai/estimate`
- `POST /ai/sponsored-request`
- `POST /ai/official-log`
- `GET /history/requests`
- `GET /history/ads`
- `GET /settings`
- `POST /settings`
- `GET /health`

## `apps/vscode-extension`

VS Code extension responsible for:

- sidebar dashboard rendering through a webview;
- status bar route and credit summary;
- mock login;
- login-provider selection between email magic link mock and Google mock;
- request execution flow;
- official vs sponsored route messaging;
- validating pending credits;
- showing request and ad history;
- privacy disclosure inside the UI.

The extension decides the route before each request by calling `/ai/estimate`, then:

- uses the local official demo client when the route is `official` inside the MVP command flow;
- uses `/ai/sponsored-request` when the route is `sponsored`.

## `packages/shared`

Shared contracts and policy:

- API request and response shapes;
- wallet, settings, history, and route decision types;
- routing constants for minimum balance, safety margin, and per-request cap;
- settings contracts for token optimization, country, and ad enablement;
- utility functions for cost display, token counting, preview generation, and route decisions.

This package is the single contract layer between backend and extension.

## `packages/ad-providers`

Extensible ad mediation layer with a stable `AdProvider` interface and mocked providers:

- `DirectSponsorProvider`
- `IdlenProvider`
- `ThradProvider`
- `AdgentekProvider`
- `HouseAdProvider`

The backend sends only safe ad metadata:

- placement
- tool
- route
- category
- approximate country
- anonymous session id

Prompts, code, repo names, files, secrets, and raw AI responses are excluded by design.

## `packages/token-optimizer`

Token optimization abstraction:

- `TokenOptimizer` interface;
- `BasicTokenOptimizer` for the local MVP;
- `HeadroomOptimizer` stub that falls back cleanly until a real integration exists.

This keeps optimization replaceable without changing backend or extension contracts.

## `prisma`

Prisma schema provides the MVP data model:

- `users`
- `sessions`
- `wallets`
- `credit_ledger`
- `ad_impressions`
- `ad_clicks`
- `ai_requests`
- `sponsor_campaigns`
- `settings`

Balances are not stored as mutable wallet totals. They are derived from ledger entries, with `PENDING` and `AVAILABLE` buckets separated.

## Security and Privacy Invariants

1. Sponsor networks never receive prompts, code, files, secrets, or raw AI output.
2. Prompt text is not stored in request history by default.
3. Sponsored credits are granted as `pending` first and only move to `available` after delayed validation.
4. Repeated or too-rapid impressions are rate-limited or marked suspicious.
5. Sponsored routing is rejected if the estimate exceeds balance, safety margin, or per-request cap.
6. Official mode does not proxy the user request through the sponsored gateway.
7. When ads are disabled, recharge pauses cleanly instead of manufacturing impressions or credits.

## Verification Surfaces

The MVP is meant to be rechecked through:

- backend tests: `npm run test:backend`
- backend smoke flow: `npm run verify:smoke`
- compile checks: `npm run build` and `npm run typecheck`
- packaging: `npm run package:extension`
- live VS Code extension verification in an Extension Development Host
