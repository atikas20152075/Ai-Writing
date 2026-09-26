# Step93 — zero-dependency scoped portal preview

This is a **development-only static UX preview**, not the promised production Next.js UI or a completed Step93 milestone. It is purposely isolated from the Next.js dependency-lockfile update until the web workspace is installed and its lockfile is reviewed.

## Local smoke

Run the existing backend with its authorized **synthetic fixtures** and `WEB_ORIGIN=http://localhost:3000`; never use real child data. Serve this directory on port 3000: `cd apps/web/prototype && python -m http.server 3000`, then open `http://localhost:3000`.

The JavaScript is pinned to `http://localhost:3001/api/v1` **only for local development**. Production requires a same-origin Next.js proxy/BFF and CSRF/threat-model review; do not deploy this static file as-is. Access tokens are kept only in tab memory. Refresh tokens remain server-managed HttpOnly cookies. Every request relies on the existing backend object-level authorization and returns current effective revisions only. There is no fake assessment or AI score.

Implemented preview pathways: login/refresh/logout; currently authorized published-topic selector and original typed-writing composer using stable retry IDs (no local draft persistence); own student submission list and current finalized result; current authorization-checked English-only PDF download; scoped teacher/academic-admin batch read. Current-linked parent assessment discovery/detail and parent/teacher cursor pagination are now implemented. Session and view request fences prevent late responses from repopulating private views after sign-out or a newer request. Human review UI, accessible rich PDF and production auth BFF are **not yet implemented**. Browsers cannot revoke reports previously downloaded by a user; the report itself identifies its as-of revision.

Required before Next.js merge: integrate proper package/lockfile, typed API client and runtime environment, SSR-safe auth/BFF and accessible role-specific routing, e2e auth/role tests, mobile accessibility and privacy QA, and release-gate confirmation. Do not claim this static preview as Next.js deployment.
