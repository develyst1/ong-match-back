# Ong Match — DEVLOG (shared record for AI agents / engineers)

> Read this first. It tracks where the project stands and what's in flight, so a
> fresh session doesn't redo or break existing work. Keep it updated: append to
> the Log (newest first) whenever you finish or change something meaningful.
> This file is duplicated in both repos (ong-match-back/ and ong-match-front/).

## What Ong Match is
Thai friend-matching app. Users create their own "ไทป์" (type/interest); each is
AI-verified via a timed quiz, gets a level (0–100, re-quizzable), and expires 30
days after creation. Matching, feed, search, chat, trending — all built around types.

## Architecture
- **Frontend** `ong-match-front`: Next.js 16 (App Router) + React 19 + Mantine 9 +
  TanStack Query + axios. bun-managed. Services have mock-data fallback.
- **Backend** `ong-match-back`: Bun + Hono + PostgreSQL. AI via `ai.develyst.online`
  (`POST /chat`). Tests: `bun test` (uses a separate `<db>_test` DB via NODE_ENV=test).
- **AI**: guardrail (reject fake types) + hidden level-band estimate + quiz gen + grading.
- **Deploy**: ONE Windows server (154.197.124.206), nginx + pm2 + Cloudflare,
  domain `ong.develyst.online`. Frontend standalone :3017, backend :4009.
  nginx same-origin: `/api/v1/*` & `/uploads/*` → backend 4009 (no path strip),
  `/api/auth/*` → frontend 3017 (NextAuth), `/` → frontend. Next `rewrites()` proxy
  `/api/v1` + `/uploads` → backend in local dev. Frontend API baseURL is EMPTY
  (same-origin) — do NOT set it to `/api` (causes `/api/api/v1` double-prefix 404).

## Features DONE (2026-07-16)
Types+quiz (guardrail, timed quiz, hidden level band, expiry, relevel, AI suggest);
profile CRUD + register (DOB, unique phone) + avatar/cover upload (stored as files,
served at /uploads, DB keeps short URLs); contact-gate (min level per type to chat);
feed (posts + follow + recommended); search (title+tags) + matching people +
seeker-side level filter; trending tag-groups; real 1:1 chat + real group chat
(tag rooms); mobile responsive; deploy /api double-prefix fixed.

## Endpoints (backend, all under /api/v1)
types: validate, suggest, /quizzes/:id/submit, /:id/relevel, /me, /:id/requirement ·
social: feed, posts, users/:id/follow, types/search, people/matches, tags/trending,
users/me (GET/PUT), users/:id, users/:id/can-contact · chat: conversations (+messages),
rooms (+/:tag/messages) · uploads. Auth: (being added — see below).

## Auth (real, as of 2026-07-16)
Email + password (Bun.password/argon2) → JWT. `src/auth/token.ts` `signToken(userId)`
/`verifyToken→userId` (HS256, 30d). **`JWT_SECRET` env is REQUIRED — token.ts throws
at import if missing** (so it must be set for dev, tests, and prod). `POST
/api/v1/auth/register` takes `{email,password(min8),displayName?,phone?,age?}` in one
call and is the ONLY way an account is created (returns 201 + token + user; 409 on
duplicate email/phone). `/auth/login` returns a generic 401 (no email-existence leak).
`userMiddleware` requires `Authorization: Bearer <jwt>`, verifies it, and confirms the
user still exists (getUserById) — there is NO `x-user-email` fallback anymore; route
tests sign a token via a helper. App-level `onError` maps ZodError→400.
Frontend: `services/auth.service.ts` `login/register` → `AuthResponse`, `authErrorMessage`,
`clearSession`; JWT in localStorage `ong-match-token`; interceptor sends Bearer and clears
the session + redirects to /login on 401. Types in `types/api/main/auth.ts`.
NextAuth no longer used for login. Existing `demo-token` sessions and passwordless junk
users can no longer authenticate.

> Note: this replaced an earlier simpler auth impl of mine during a merge with
> `origin/dong` (another agent's version was more complete — kept it). My non-auth
> work (the /api double-prefix fix, relative uploads, Next rewrites) was preserved.

## Known issues / gaps
- `/api/v1/tribes` and `/interests` 404 (never implemented; frontend falls back to mock).
- Demo seed users use emails `@ong.demo` (run `bun run src/db/seed.ts`).
- Test junk historically written to prod DB as `%@x.co` (now isolated to test DB).

## Log (newest first)
- **2026-07-16 — Real authentication (DONE, merged)**: fixed the "any email/password
  logs in + creates junk users" hole. Resolved a merge with `origin/dong` that also
  added auth — kept the remote's more complete version (see Auth section) + my non-auth
  fixes. Verified: garbage login 400/401, spoofed x-user-email→401, demo-token→401,
  real register/login→token→app works. 34 backend tests pass, both repos tsc clean.
  **TODO on server: set `JWT_SECRET` (long random) in backend .env, rebuild+restart both
  via pm2.** Junk passwordless users purged from prod (kept @ong.demo + real accounts).
- 2026-07-16 — Fixed deploy `/api/api/v1` double-prefix (baseURL was `/api`), uploads
  return relative URLs, Next rewrites for dev, nginx ong.conf (/api/auth + /uploads).
- Earlier — see git log: types v2, feed, chat 1:1 + group, trending, upload, responsive.
