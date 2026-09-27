# Step93 — Next.js student, guardian and teacher portal

Baseline: merged PR #13, `0689508882ed2706bdb92aaae27c8c1fce93e20a`.

## Implemented scope

The `apps/web` workspace now has a pinned Next.js App Router application rather than only a static prototype. It includes responsive role-specific workspaces, original typed writing using published topics and stable retry IDs, pending/finalized assessment states, factor rationale/evidence from the approved result, current English PDF requests, parent pagination and assigned teacher cohort discovery. The earlier prototype remains historical development evidence.

The UI displays server results only. The PFCR overview describes the learning method; it does not claim the complete practice/correction/rewrite engine is implemented. No real model or child data was used.

## Authentication boundary

`/api/portal/[...path]` is a fixed-upstream, explicitly allowlisted server route. It does not accept arbitrary URLs, caller-provided bearer credentials, guardian identities, upstream headers or redirects. NestJS continues to perform current DB session/role/resource authorization. The gateway adds private/no-store responses, bounded request/response reads, timeouts, generic error responses, PDF content-type validation and attachment disposition.

Login/refresh token values are exchanged only server-side. Browser cookies are HttpOnly and SameSite=Strict; HTTPS uses Secure `__Host-` cookies. Production requires explicit HTTPS `WEB_PUBLIC_ORIGIN` and a fixed `WRITING_API_URL`. An exact Origin check protects all POSTs; a custom same-origin client header is required on every gateway operation. No permissive CORS response is emitted.

Session restoration first verifies the existing access cookie. It rotates the refresh token only if needed. Browser Web Locks serialize auth operations across supported same-origin tabs; BroadcastChannel clears other tab views on account/session changes. Session and request fences reject obsolete responses, including delayed body parsing. Sign-out clears private UI immediately; failed server revocation is stated as unconfirmed. Downloaded reports cannot be remotely erased.

The backend's existing source-IP rate limiter sees the BFF's address. No untrusted forwarded IP is propagated. Per-client ingress budgeting/trusted proxy deployment, a full threat review and browser coverage beyond Chromium remain pre-release work. NestJS must be privately routed in deployment, with transport protection appropriate to the approved infrastructure.

## Local synthetic setup

From repository root run `npm ci`, then start the existing synthetic NestJS service with `WEB_ORIGIN=http://localhost:3000` and its required DB/secrets. Start web with:

```sh
WEB_PUBLIC_ORIGIN=http://localhost:3000 WRITING_API_URL=http://127.0.0.1:3001/api/v1 npm --workspace apps/web run dev
```

Open `http://localhost:3000`. `NEXT_TELEMETRY_DISABLED=1 npm --workspace apps/web run build` validates the optimized bundle. Use HTTPS and explicit runtime configuration for any production-mode serving; a successful build is not deployment approval.

## Tests and evidence boundaries

- Eight executable gateway tests cover route/method/query rejection, origin/CSRF checks, HttpOnly token exchange, session restoration, diagnostic/header suppression, size limits, private PDF delivery and failure-safe local sign-out.
- The real PostgreSQL suite adds scoped cohort discovery/revocation with no global administrator bypass.
- Playwright exercises desktop and mobile Chromium through the actual Next.js gateway with a separately launched synthetic upstream server. Test-only identities, marks and PDF transport fixtures are isolated in `e2e/upstream.mjs`, never imported by the application.
- Browser scenarios include typed submission, pending/approved result, parent pagination/PDF, teacher discovery, HttpOnly cookies, cross-tab sign-out, blocked routes and late-response removal. These do not substitute for a single full-stack browser run against live NestJS/PostgreSQL, academic quality benchmarks or a full accessibility audit. Backend DB/HTTP integration is independently mandatory in CI.
- CI preserves synthetic screenshots/traces for seven days. Only completed successful runs should be recorded as passing evidence.

## Remaining release work

Bilingual font-embedded accessible PDFs; private report object lifecycle; human-review UI; full PFCR linked rewrite and learning views; handwriting/OCR; production identity/guardian verification and retention/deletion; independent academic/privacy/security sign-off; staging/recovery/load tests. None is implied by this frontend milestone. Production and real AI processing remain off.
