# ATA Credits MVP Launch Plan

## P0: Local MVP That Must Stay Green

- VS Code extension sidebar and status bar work locally.
- Mock login creates a user session and wallet.
- Sponsor cards appear during request flows.
- Credits move from `pending` to `available` only after delayed validation.
- The routing decision is made before request start and shown clearly in the UI.
- Official mode keeps working without using the sponsored gateway.
- Sponsored mode uses the backend gateway only after the balance, safety margin, and per-request cap checks pass.
- Backend tests, smoke verification, build, typecheck, and VSIX packaging all pass.

## P1: Replace Local Mocks With Real Integrations

- Add real Google OAuth or magic-link delivery.
- Replace mock Idlen integration.
- Replace mock Thrad integration.
- Replace mock Adgentek integration.
- Add a real direct sponsor campaign management surface.
- Replace the `HeadroomOptimizer` stub with a production adapter.

## P2: Harden For Production

- Move from local SQLite MVP storage to PostgreSQL.
- Add distributed rate limiting and stronger anti-fraud heuristics.
- Add advertiser analytics and campaign reporting.
- Add operational dashboards, CI, and deploy automation.
- Add a privacy and security review for open-source publication.

## Launch Gates

Before calling the MVP ready for broader usage:

1. The sponsored and official flows must both be reproducibly verified from the current worktree.
2. Request history must stay privacy-safe and avoid storing prompt text by default.
3. Sponsor networks must only receive safe metadata.
4. The packaged VSIX must install cleanly in an Extension Development Host.
5. The repo surface and docs must describe ATA Credits rather than legacy Waitline behavior.
