# Improve Email and Password Authentication

Add password recovery and email confirmation to Zarka's existing email/password account flow without disrupting guest, Google, or Facebook sign-in.

## Context and Current Behavior

`client/src/scenes/LoginScene.ts` implements email login and registration in `LoginScene`. Login accepts either an email or username and calls Nakama JS `Client.authenticateEmail`. Registration requires email, username, and a password of at least eight characters, then calls `authenticateEmail(..., true, username)` and immediately proceeds to the game. There are no forgot-password or email-confirmation flows in the client or server module. The project runs Nakama 3.40.0, its TS runtime is built from `server/modules/src/main.ts`, and transactional email delivery is not configured in the checked-in `server/local.yml.example` or Compose configuration. Nakama's TypeScript runtime exposes `nk.httpRequest`, which can call an email provider's HTTPS API.

The Nakama JS SDK in use exposes email authentication, but no password-reset or email-verification client methods. Nakama's documented email/password flow does not itself provide these user-facing features. In particular, confirming an address and safely changing a stored password require a trusted server-side design and configured email delivery; client-only tokens or direct database password edits are not acceptable.

## Design

Keep the existing email/username login and social/guest methods. Add clear recovery and confirmation entry points to the email-auth UI, with separate pending/success/error status states and a way to return to login.

### Email delivery

Use the SendGrid Mail Send HTTPS API (`POST https://api.sendgrid.com/v3/mail/send`) directly from Nakama's TypeScript runtime via `nk.httpRequest`. Nakama's runtime typings expose this HTTP request API, and Heroic Labs documents a SendGrid integration pattern. This does not require a separate email server or SMTP library. Inject the SendGrid API key and verified sender address through server-only runtime environment configuration; check the HTTP response (successful sends return `202`), use a bounded timeout, and never log credentials or token-bearing message contents. Actual outbound network access and production sender/domain setup still need validation.

### Password recovery findings and options

Nakama's documented email/password authentication and the current JavaScript SDK provide registration/login, but no built-in forgot-password flow. Community reports and examples generally use custom recovery endpoints: issue a short-lived, single-use reset token, email a link, then validate the token on the server. SendGrid can deliver the link but cannot perform the Nakama credential update. Some community examples update Nakama's internal `users` database row directly; this is an unofficial, version-sensitive approach and is not recommended for Zarka without explicit Heroic Labs confirmation. The logged-in account credential-link/update API is not by itself an unauthenticated recovery mechanism for a locked-out player.

Options to resolve the credential-update gap:

1. **Preferred first step — confirm a supported Nakama mechanism with Heroic Labs** for Nakama 3.40.0 and this runtime. If supported, build the custom token flow around that mechanism.
2. **Move email/password identity to an external identity provider** with built-in recovery and verification, then authenticate/link those identities with Nakama. This is a larger architecture and account-migration decision.
3. **Custom Nakama recovery plus direct database mutation** only if Heroic Labs explicitly approves the exact method for the deployed version. Do not assume the community examples are production-safe; assess compatibility, password hashing, transactionality, and upgrade implications before implementation.
4. **Temporary support-assisted recovery** through a verified, approved administrative process while a self-service mechanism is unavailable.

Do not modify Nakama's database directly or put privileged Nakama credentials in the browser as an assumed implementation. Keep reset-token processing and all credential changes on a trusted server. Likewise, do not assume custom application confirmation state changes Nakama's native `verify_time` or causes Nakama itself to reject unverified email credentials.

For confirmation, persist application-owned confirmation state only after validating the one-time token. Decide whether confirmation is informational or a prerequisite for playing. If it gates play, enforce the rule on trusted server operations as well as in the client; do not rely on hiding UI. Preserve access for existing accounts unless a migration/backfill policy is explicitly chosen.

## User Review Required

> [!IMPORTANT]
> **Password reset mechanism:** Nakama 3.40.0 and the current JS SDK do not expose a documented self-service reset flow. First ask Heroic Labs to confirm an approved credential-update mechanism. Avoid direct SQL/internal database edits unless Heroic Labs explicitly approves the exact approach for this deployed version. If no supported mechanism exists, choose between an external identity provider and support-assisted recovery.

- Confirm SendGrid is the chosen provider and configure the production API key, verified sender identity/domain, and delivery settings. The design calls SendGrid's HTTPS API directly from Nakama's runtime; it does not require a separate mailer server or SMTP library.
- Should unconfirmed users be blocked from logging in, allowed into the game with a reminder, or only prevented from account-sensitive actions? This also determines treatment of existing accounts and social/guest users.
- Should successful registration automatically send a confirmation email and still establish a session, or require confirmation before entering the game?
- Confirm intended password policy for resets (minimum length and any further requirements) and token expiry/resend behavior.

## Proposed Changes

### Client authentication UI

- `client/src/scenes/LoginScene.ts`: Add forgot-password and resend/confirm-email UI states/actions alongside the existing `Entry`, `Login`, and `Register` flow. Use email-only input for recovery/confirmation, validate input, prevent duplicate submissions, and return generic recovery responses that do not reveal account existence. Handle completion links/codes safely and clearly. Revisit native input autocomplete/type and layout handling for added states; retain username login and current registration validation unless policy is approved to change.
- `[NEW] client/test/<email-auth-ui-test>.test.ts`: Add focused tests for input validation, state transitions, duplicate submission prevention, and non-enumerating recovery messages, following the existing client test conventions.

### Trusted authentication and email delivery

- `server/modules/src/main.ts`: Register the authenticated or public RPCs required by the selected flow only after the trust model is established. Recovery-request endpoints must be callable without an authenticated session and return the same response for known and unknown addresses; token redemption must validate purpose, expiry, and single use server-side.
- `[NEW] server/modules/src/rpc/<email-auth-rpc>.ts`: Add narrowly scoped RPC handlers for requesting password recovery, redeeming a reset, requesting confirmation/resend, and redeeming confirmation as required by the chosen mechanism. Validate and normalize payloads, rate-limit abuse, and avoid leaking account lookup or token details.
- `[NEW] server/modules/src/services/<email-auth-service>.ts`: Implement token generation/validation, expiry, single-use semantics, and provider integration behind explicit interfaces. Store only token hashes and minimal metadata using an approved storage mechanism; do not store passwords or raw tokens. Confirm Nakama runtime compatibility and persistence semantics before choosing storage APIs.
- `server/local.yml.example` and deployment secret configuration: Document server-only `SENDGRID_API_KEY` and verified `SENDGRID_FROM_EMAIL` placeholders and inject them into Nakama's runtime environment. Do not commit real credentials or expose them to the browser. Confirm whether Compose or deployment scripts need changes to supply these values.
- `[NEW] server/modules/src/services/sendGridEmail.ts`: Wrap Nakama `nk.httpRequest` for `POST https://api.sendgrid.com/v3/mail/send`, construct the minimal SendGrid Mail Send JSON payload, set bearer authorization and content type, use a bounded timeout, and handle non-202 responses without logging secrets or token-bearing content.
- `[NEW] server/modules/test/<email-auth-test>.test.ts`: Cover valid, expired, reused, wrong-purpose, malformed, and unknown-account requests; verify non-enumerating responses, rate limits, and that tokens/passwords are not exposed in logs or storage.

### Confirmation enforcement and account policy

- `server/modules/src/rpc/` and relevant authenticated game-operation paths: If the user chooses to gate game access, enforce confirmation server-side at the narrowest shared authorization boundary supported by Nakama and the current RPC/match architecture. Identify all access routes (RPCs, matchmaking, match join/submit) before implementation; do not assume checking only `LoginScene` is sufficient.
- `[NEW] server/modules/src/services/<email-confirmation-state>.ts`: If app-owned confirmation state is needed, isolate its read/write and legacy-account behavior. Prefer a project-owned state record over unsupported writes to Nakama internals. Define how identity linking/email changes invalidate or renew confirmation.
- Add tests for confirmed/unconfirmed email accounts, existing accounts without state, and guest/social accounts so policy does not accidentally lock out other login methods.

### Link and client delivery integration

- Deployment/email template configuration (new configuration or service files as selected): Use HTTPS, single-use purpose-specific links, avoid putting passwords or long-lived credentials in query strings, and ensure the application can receive and validate callback tokens. Document local development and production redirect origins.
- Confirm the exact callback URL/routing mechanism with Zarka's hosting setup before naming client files for deep-link parsing.

## Verification Plan

### Automated Tests

- Existing client test suite: `cd client; npm test` — run after adding UI tests; exact runner invokes `client/scripts/test-all.mjs`.
- Existing client typecheck/build: `cd client; npm run build`.
- Existing client lint: `cd client; npm run lint`.
- Existing server module tests: `cd server/modules; npm test`.
- Existing server module build: `cd server/modules; npm run build`.
- Add targeted service/RPC tests for token lifecycle, rate limiting, account enumeration resistance, email delivery failure, and enforcement policy. Use injected provider/storage dependencies rather than sending real emails in unit tests.
- After any server module implementation, follow the repository rule to rebuild and redeploy Nakama: from `server/modules`, run `npm run build`; then from `server`, run `docker compose up -d --build nakama`. Validate runtime startup and RPC behavior in the configured environment.

### Manual Verification

- With a SendGrid test setup and real configured Nakama instance, register an email account, receive/complete confirmation, and verify the selected unconfirmed-account policy. Check that missing/invalid API configuration and SendGrid non-202 responses are handled safely.
- Request reset for both registered and unregistered addresses and verify identical user-facing responses; open a valid link, set a new password, log in with the new password, and verify the old password fails.
- Verify expired, altered, and replayed tokens fail without disclosing account details; verify resend and rate-limit behavior.
- Confirm username login, guest, Google, and Facebook flows remain functional; exercise layout/input behavior on desktop and mobile-sized viewports.
- Confirm provider downtime/failure leaves recoverable UI feedback and does not expose credentials or tokens in logs.

## Risks and Open Questions

- A safe, supported mechanism to update an existing Nakama email account's password must be established first. Community examples often rely on direct database changes, but this is unofficial and version-sensitive; obtain Heroic Labs guidance before considering that path. Otherwise use an external identity provider or support-assisted recovery.
- SendGrid delivery, sender/domain verification, secrets management, redirect hosting, and abuse controls are currently absent from the inspected configuration. `nk.httpRequest` is present in the Nakama runtime typings, but runtime network access and production SendGrid delivery still need environment-level validation.
- Native Nakama email verification state and application-owned confirmation state are not interchangeable. Gating gameplay on custom state requires comprehensive server-side enforcement and a legacy-account policy.
- Proposed new paths above are placeholders. Confirm password reset capability, SendGrid credentials/sender setup, link routing, storage semantics, and the relevant authorization boundary before turning this plan into a file-by-file implementation task.
