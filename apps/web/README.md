# Writing Studio — Next.js development portal

The current App Router application lives in `app/` with a fixed-upstream authentication gateway in `lib/gateway.ts`. Student, parent and teacher workspaces use the existing current-authority APIs. No bearer token is exposed to browser JavaScript.

Setup, environment, scope and verification: [Step93 Next.js portal](../../docs/step93-nextjs-portal.md).

```sh
npm ci
npm --workspace apps/web test
npm --workspace apps/web run build
npm --workspace apps/web run dev
```

Playwright: `npx playwright install --with-deps chromium`, then `npm --workspace apps/web run test:e2e`. The browser suite launches a synthetic upstream and local Next development server. It never uses real children or live AI. The existing `prototype/` is historical, not the current application.

No production deployment or full Step92 production closeout is claimed.
