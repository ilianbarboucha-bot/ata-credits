# ATA Credits MVP

Local monorepo MVP for a VS Code extension that:

- shows sponsor cards during AI wait time;
- accrues `pendingCredits` then `availableCredits`;
- decides `Sponsored` vs `Official` before each request;
- never sends prompts, code, files, or secrets to ad providers.

## Active Structure

```text
/apps/backend
/apps/vscode-extension
/packages/shared
/packages/ad-providers
/packages/token-optimizer
/prisma
README.md
```

## What This MVP Covers

- mock login by email magic link or Google;
- wallet backed by a ledger, not a mutable balance field;
- ad mediation waterfall:
  - Direct sponsors
  - Idlen
  - Thrad
  - Adgentek
  - House ad fallback
- pending vs available credit flow with delayed validation;
- sponsored routing threshold, safety margin, and max cost cap;
- token optimization interface with `BasicTokenOptimizer` and `HeadroomOptimizer` stub;
- VS Code status bar plus sidebar webview;
- settings for token optimization, country, and sponsor-card activation;
- request history and ad history;
- sponsored gateway mock with reserve, capture, and refund ledger entries;
- privacy messaging and safe ad metadata only.

## Local Notes

- Prisma is wired with SQLite for local MVP speed.
- PostgreSQL remains the intended production target.
- `Official` mode in this MVP is transparent:
  - it does not use the sponsored gateway;
  - it uses a local demo official client inside the extension command surface unless you replace it later.

## Install

```bash
npm install
npm run db:push
npm run build
```

## Run

Backend:

```bash
npm run dev:backend
```

Extension watch build:

```bash
npm run dev:extension
```

Package the VSIX:

```bash
npm run package:extension
```

Run the end-to-end backend smoke verification:

```bash
npm run verify:smoke
```

## Default Backend URL

The extension points to:

```text
http://127.0.0.1:8787
```

You can override it in VS Code settings with:

```text
ataCredits.apiBaseUrl
```

## Main Endpoints

```http
POST /auth/login
GET /wallet
POST /ads/request
POST /ads/impression
POST /ads/click
POST /credits/validate
POST /ai/estimate
POST /ai/sponsored-request
GET /history/requests
GET /history/ads
GET /settings
POST /settings
```

Extra MVP helper:

```http
POST /ai/official-log
```

This stores official-mode request metadata without proxying the request through the sponsored gateway.

`POST /ads/request` can legitimately return `ad: null` with `adsEnabled: false` when sponsor cards are disabled in settings.

## Routing Rules

Defaults are encoded in `packages/shared`:

```ts
MIN_SPONSORED_BALANCE = 0.50
SAFETY_MARGIN_PERCENT = 0.35
MAX_SPONSORED_COST_PER_REQUEST = 0.20
```

Decision flow:

```text
1. Estimate cost
2. Optimize tokens if enabled
3. Check available credits
4. Choose Sponsored or Official before request start
5. Never switch route mid-request
```

## Privacy Guarantees Enforced In This MVP

- ads never receive raw prompts;
- ads never receive source code;
- ads never receive repo names or file contents;
- prompts are not logged by default;
- only safe metadata is sent to ad providers;
- disabling sponsor cards pauses recharge instead of faking impressions;
- user API keys remain local if support is added later.

## Verification Commands

```bash
npm run test:backend
npm run verify:smoke
npm run build
npm run typecheck
npm run package:extension
```

## Real Integration TODOs

- see `docs/external-provider-onboarding.md` for the live signup and credential-capture checklist for Google Workspace, Idlen, Thrad, and Adgentek;
- replace SQLite with PostgreSQL;
- add real Google OAuth or magic link delivery;
- add real Idlen adapter;
- add real Thrad adapter;
- add real Adgentek adapter;
- add real direct sponsor campaign dashboard;
- replace mock official client with a real local official-provider integration;
- replace `HeadroomOptimizer` stub with a real adapter;
- add Redis-backed distributed rate limiting;
- add stronger anti-fraud heuristics and audit tooling.
