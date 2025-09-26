# Repository Guidelines

## Project Structure & Module Organization
Next.js App Router code lives in `app/`; legacy routes stay in `pages/` until migrated. Shared components sit in `components/`, hooks in `hooks/`, and cross-cutting logic in `lib/` and `utils/`. Supabase adapters and SQL helpers live in `supabase/`, while customer copy and templated emails live in `messages/`. Maintenance scripts belong in `scripts/`, and Jest specs default to `__tests__/` or co-located beside the feature.

## Build, Test, and Development Commands
Use the npm scripts below during daily work.
- `npm run dev` – start the Next.js dev server with live Supabase integration.
- `npm run build` – compile the production bundle before deployments.
- `npm run start` – serve the built output locally for smoke tests.
- `npm run lint` – run ESLint with Next.js rules; fix findings before opening a PR.
- `npm run typecheck` – ensure TypeScript stays strict after structural changes.
- `npm run test` / `npm run test:watch` – execute the Jest + Testing Library suite.
- `npm run format` – apply Prettier formatting repo-wide.
- `npm run cleanup-staging-tables` and related `scripts/*` utilities – handle Supabase maintenance tasks.

## Coding Style & Naming Conventions
Write in TypeScript with functional React components and Tailwind utility classes. Use PascalCase for components (`components/BookingSummary.tsx`), `use` prefixes for hooks, and camelCase for helper modules. Trust Prettier via `npm run format`; avoid manual spacing and let ESLint (`npm run lint -- --fix`) resolve minor issues.

## Testing Guidelines
Keep tests hermetic with Jest and Testing Library. Name files `*.test.ts` or `*.test.tsx`, and mock Supabase plus other external APIs using shared fixtures. Prioritize regression coverage for booking allocation, notifications, and row-level security policies.

## Commit & Pull Request Guidelines
Follow Conventional Commit prefixes (`feat:`, `fix:`, `chore:`, `docs:`) and keep the subject under 72 characters. Pull requests need a problem statement, solution summary, verification notes, and links to issues; add screenshots or recordings for UI work. Flag schema or cron changes so reviewers can plan Supabase migrations.

## Environment & Secrets
Store secrets only in `.env.local` (local) or managed Vercel/Supabase secrets (remote); never commit credentials. Sync the shared template, update environment-specific keys, and confirm `npm run dev` connects before creating branches.
