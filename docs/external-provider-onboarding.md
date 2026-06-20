# ATA Credits External Provider Onboarding

This document tracks the real-world onboarding work required to give ATA Credits:

- a professional Google-hosted project inbox;
- Idlen as a publisher ad provider;
- Thrad as a publisher ad provider;
- Adgentek as a publisher ad provider.

It exists because the current repo still uses mocked provider adapters in
`packages/ad-providers/src/index.ts`, while the public provider websites expose
real signup and integration requirements that must be completed outside the repo.

## Current State

- Browser automation is attached to this Codex session via Playwright.
- Public provider pages and docs were inspected on June 19, 2026.
- Live signup and login surfaces were re-checked on June 19, 2026 and June 20, 2026.
- Current browser screenshots were saved under `output/playwright/` on June 20, 2026.
- The repo now has `.env.example` placeholders for the credentials that will be
  produced once the external onboarding is actually finished.

## Shared Inputs To Capture Once

These values are reused across Google, Idlen, Thrad, and Adgentek and should be
filled in `.env.example` or a local `.env` before the next onboarding pass:

- `ATA_CREDITS_CONTACT_FIRST_NAME`
- `ATA_CREDITS_CONTACT_LAST_NAME`
- `ATA_CREDITS_CONTACT_FULL_NAME`
- `ATA_CREDITS_PUBLIC_URL`
- `ATA_CREDITS_PROJECT_DESCRIPTION`
- `ATA_CREDITS_MAU_BAND`
- `ATA_CREDITS_ESTIMATED_MONTHLY_TURNS`
- `ATA_CREDITS_GOOGLE_GMAIL_USERNAME`

## 1. Google Workspace Project Inbox

Goal:

- create a professional inbox for ATA Credits using Google Workspace;
- use it as the admin / recovery email for provider dashboards.

Official references:

- `https://workspace.google.com/solutions/business-email/`
- `https://knowledge.workspace.google.com/admin/getting-started/sign-up-for-a-free-google-workspace-trial`
- `https://knowledge.workspace.google.com/admin/getting-started/sign-up-for-google-workspace`

What Google states publicly:

- signup can start with a personal Gmail or business email;
- a domain can be verified later or purchased during signup;
- Google Workspace, not "Gmail Pro", is the actual business-email product.

Observed Google consumer-signup sequence on June 20, 2026:

1. name step with `firstName` and optional `lastName`;
2. birthday / gender step;
3. email-or-phone ownership step;
4. branch `You don't have an email address or phone number?`;
5. Gmail username choice step;
6. password step;
7. mandatory anti-abuse device verification step using phone / QR code.

Observed blocker on June 20, 2026:

- after choosing a Gmail username and password, Google required device
  validation through a QR code and phone flow before account creation could
  continue;
- the blocker screenshot was captured as
  `output/playwright/google-verification-blocker.png`.

Required inputs before final signup:

- legal entity or public organization name;
- preferred admin email format, for example `hello@...` or `team@...`;
- domain to use, or decision to buy one during signup;
- recovery email;
- billing owner and payment method;
- country and timezone.

Suggested ATA Credits setup:

- workspace admin inbox: `hello@<project-domain>`
- recovery inbox: a separate owner-controlled mailbox
- edition to start: Business Starter

Repo fields to fill after creation:

- `ATA_CREDITS_WORKSPACE_ADMIN_EMAIL`
- `ATA_CREDITS_WORKSPACE_DOMAIN`
- `ATA_CREDITS_WORKSPACE_RECOVERY_EMAIL`

## 2. Idlen Publisher Onboarding

Public references inspected:

- `https://www.idlen.io/publishers/`
- `https://www.idlen.io/publishers/sdk/`
- `https://dashboard.idlen.io/register`

What Idlen states publicly:

- self-serve publisher onboarding;
- TypeScript SDK on npm via `@idlen/chat-sdk`;
- real-time dashboard and monthly payout flow;
- 70% rev share and no credit card required on the public publisher page.

Observed public signup surface:

- publisher account creation page at `https://dashboard.idlen.io/register`;
- login page at `https://dashboard.idlen.io/login?redirect=/`;
- create-account fields: `full name`, `email`, `password`, `confirm password`;
- `Continue with GitHub` and `Continue with Google` are also offered;
- `https://adsmanager.idlen.io/register` is the advertiser flow, not the
  publisher earnings dashboard flow.
- screenshot captured on June 20, 2026:
  `output/playwright/idlen-register-2026-06-20.png`.

Integration evidence from public docs:

- install package: `npm install @idlen/chat-sdk`
- expected publisher key shape shown in docs: `idl_pk_your_key_here`

Data to prepare before signup:

- project contact name;
- work email from Google Workspace;
- project URL;
- product summary;
- payout recipient details if requested after signup.

Credentials/artifacts expected after signup:

- publisher dashboard URL;
- publisher API key;
- publisher identifier or placement identifier;
- any payout or invoicing profile IDs.

Repo fields to fill after creation:

- `ATA_CREDITS_IDLEN_ACCOUNT_EMAIL`
- `ATA_CREDITS_IDLEN_ACCOUNT_NAME`
- `ATA_CREDITS_IDLEN_PUBLISHER_API_KEY`
- `ATA_CREDITS_IDLEN_PUBLISHER_ID`
- `ATA_CREDITS_IDLEN_DASHBOARD_URL`

Implementation follow-up in repo:

- replace `IdlenProvider` mock campaign body and fetch logic;
- add a real server-side fetch path or SDK-backed adapter;
- keep privacy-safe metadata only.

## 3. Thrad Publisher Onboarding

Public references inspected:

- `https://www.thrad.ai/publisher`
- `https://docs.thrads.ai/sdk/reference`
- `https://docs.thrads.ai/api/api-reference/bid-request`

What Thrad states publicly:

- publishers can monetize AI prompts and conversational traffic;
- SDK and API integrations are available;
- public docs expose a JavaScript SDK token model and a server-side API key model.

Observed public onboarding situation:

- publisher marketing page is public;
- docs are public;
- `Request inventory access` points to `https://platform.thrads.ai/login`;
- the platform also exposes a public signup form at
  `https://platform.thrad.ai/signup`;
- observed signup fields: `first name`, `last name`, `work email`.
- screenshot captured on June 20, 2026:
  `output/playwright/thrad-signup-2026-06-20.png`.

Integration evidence from public docs:

- client SDK tag uses `https://sdk.thrad.ai/sdk.js?token=YOUR_PUBLISHER_ID`
- server-side API requires `thrad-api-key`
- contextual bid request requires careful handling of user IP, user agent, and
  sanitized conversation payloads

Data to prepare before onboarding:

- project URL;
- app description;
- estimated traffic or prompt volume;
- category restrictions and brand safety requirements;
- decision on SDK mode vs server-side SSP API mode.

Credentials/artifacts expected after onboarding:

- dashboard URL;
- publisher ID for client SDK token usage;
- API key for server-side SSP requests;
- any placement configuration IDs.

Repo fields to fill after creation:

- `ATA_CREDITS_THRAD_ACCOUNT_EMAIL`
- `ATA_CREDITS_THRAD_PUBLISHER_ID`
- `ATA_CREDITS_THRAD_API_KEY`
- `ATA_CREDITS_THRAD_SDK_TOKEN`
- `ATA_CREDITS_THRAD_DASHBOARD_URL`

Implementation follow-up in repo:

- replace `ThradProvider` mock;
- decide whether ATA Credits should use:
  - Thrad JS SDK injection for web surfaces;
  - or server-side SSP bid requests for extension/backend controlled placements.

Important privacy constraint:

- Thrad public API docs show message payload examples and say PII must be removed
  or masked before sending. ATA Credits must preserve that invariant.

## 4. Adgentek Publisher Onboarding

Public references inspected:

- `https://adgentek.ai/publishers/`
- `https://app.adgentek.ai/publishers/auth`

What Adgentek states publicly:

- publisher account is self-serve;
- built for conversational AI;
- publisher keeps placement, category, frequency, and brand controls.

Observed public signup fields from the live form:

- `your name`;
- `company name`;
- `email`;
- `password`;
- `confirm password`;
- `site or app URL`;
- `description`;
- `MAU band`;
- `estimated monthly turns` (optional).
- screenshot captured on June 20, 2026:
  `output/playwright/adgentek-signup-2026-06-20.png`.

Data to prepare before signup:

- workspace email;
- app URL;
- short product description;
- MAU estimate;
- content category and geo focus.

Credentials/artifacts expected after signup:

- publisher dashboard URL;
- publisher ID;
- API key or SDK token;
- placement identifiers and monetization settings.

Repo fields to fill after creation:

- `ATA_CREDITS_ADGENTEK_ACCOUNT_EMAIL`
- `ATA_CREDITS_ADGENTEK_PUBLISHER_ID`
- `ATA_CREDITS_ADGENTEK_API_KEY`
- `ATA_CREDITS_ADGENTEK_DASHBOARD_URL`

Implementation follow-up in repo:

- replace `AdgentekProvider` mock;
- wire real request/response mapping once account credentials are available;
- preserve the repo's current privacy promise that ads never receive prompts,
  code, files, repo names, or secrets unless a provider integration is explicitly
  redesigned around sanitized, policy-approved payloads.

## 5. Repo Integration Targets

The external onboarding work maps directly to these code surfaces:

- `packages/ad-providers/src/index.ts`
- `apps/backend/src/services/adService.ts`
- `.env.example`

The repo now also carries shared pre-signup placeholders so the next browser
session can copy values directly instead of rediscovering them from the forms.

Minimum integration plan once credentials exist:

1. Add provider-specific env reads in backend config.
2. Replace mocked provider fetch logic with real adapters one provider at a time.
3. Keep waterfall order:
   - direct
   - idlen
   - thrad
   - adgentek
   - house
4. Add focused integration tests or mocked contract tests per provider.
5. Re-run build, typecheck, backend tests, smoke, and VSIX packaging.

## 6. Blocking Items For Final Completion

The following are still required before the original user goal can be truthfully
marked complete:

- project identity details;
- domain / email choice for Google Workspace;
- the Google anti-abuse phone / QR verification step;
- any phone, billing, or additional verification steps required by providers;
- successful creation of the external accounts themselves;
- capture of the resulting provider credentials and dashboard URLs.
