# Refactoring and Vulnerability Tasks

This document summarizes areas in the repository that require refactoring or contain potential vulnerabilities. Each item is scored for **Impact** and **Urgency** on a three‑level scale (High, Medium, Low) and sorted by the highest combined priority.

## Notes

- `apps/web/lib/csp.ts` enables `'unsafe-inline'` scripts in production due to pending refactoring.
- `packages/prisma/.env` is a broken symlink referencing `../../.env`.

## Summary

| # | File(s) | Issue | Impact | Urgency |
|---|---------|-------|-------|---------|
|1|`packages/features/insights/server/events.ts` and `routing-events.ts`|Dynamic SQL is built with `Prisma.raw` (e.g., `buildSqlCondition`) without sanitization, risking SQL injection.|High|High|
|2|`packages/app-store-cli/src/utils/execSync.ts` & `core.ts`|User-supplied values are passed to `child_process.exec` unsanitized, allowing command injection.|High|High|
|3|`scripts/vercel.sh`|Runs `curl -sL https://app.snaplet.dev/get-cli/ \| bash`, which could execute malicious code if the source is compromised.|High|High|
|4|`apps/web/pages/_document.tsx`|Uses `dangerouslySetInnerHTML` with variables like `newLocale`; without sanitization, this can lead to XSS.|Medium|High|
|5|`packages/prisma/auto-migrations.ts`|Calls `exec("yarn prisma migrate deploy")` with limited error handling, leading to unpredictable failures.|Medium|Medium|
|6|`packages/prisma/.env` symlink|Symlink points to a non-existent `../../.env`, causing tooling errors and confusion.|Low|Medium|
|7|`apps/web/public/service-worker.js`|Debug `console.log` statements remain in the production service worker, potentially exposing internal details.|Low|Medium|
|8|`apps/web/lib/QueryCell.tsx` & others|Frequent `@ts-expect-error` and `as any` casts reduce type safety and indicate areas needing refactoring.|Low|Medium|
|9|`apps/web/lib/csp.ts`|CSP allows `'unsafe-inline'` (and `'unsafe-eval'` in non-production), weakening script injection protection.|Medium|Low|
|10|`git-setup.sh` & `git-init.sh`|Automatically pulling submodules from remote URLs without integrity checks presents a supply-chain risk.|Medium|Low|
|11|Repository-wide TODO/FIXME notes|Numerous pending tasks (e.g., rate-limiting, untested functions) highlight incomplete implementations.|Low|Low|

These issues are prioritized by severity and potential impact on security and maintainability. Addressing the high-impact items should be considered first.
