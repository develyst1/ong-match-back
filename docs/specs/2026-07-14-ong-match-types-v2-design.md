# Ong Match — Type System v2 (Phase 1) — Design

**Date:** 2026-07-14
**Status:** Approved (Phase 1)
**Scope:** Turn Ong Match from a static tribe picker into a chat-app where "ไทป์" (types)
are user-generated, AI-verified via timed quizzes, leveled up over time, and expire after 30 days.

---

## 1. Goal & Non-Goals

### Goal (Phase 1)
- Users **create their own types** (title + free-text elaboration), not pick from a fixed list.
- Creation is **deliberately not easy**: an AI-generated **timed quiz (≥3 questions)** gates the type,
  to stop people faking types just to hit on others.
- Passing the quiz grants a **level (0–100)**; users can **re-quiz to level up** ("เกมยิงปืน lvl100").
- Each type on a profile **expires 30 days** after its first creation; types can be reborn freely.
- The AI call + **guardrail against fake/nonsensical types ("ไทป์มั่ว")** lives in the **backend**.
- Backend: **Bun + Hono + TypeScript + PostgreSQL**. Frontend: **Next.js**, UI reworked to feel
  like a real chat app (not a management dashboard).

### Non-Goals (deferred to Phase 2/3)
- Tag clustering + trending home ("กลุ่มคนเยอะ", กีตาร์/ดนตรี/บรรเลง).
- AI semantic search for types.
- Match preference rules (must-match / don't-care / level ≥ X% of mine).
- Real chat backend (Phase 1 keeps the existing frontend mock chat).

> Tags ARE generated and stored in Phase 1 (cheap, one AI call) so Phase 2 clustering has data —
> only the clustering/trending **UI** is deferred.

---

## 2. Architecture

```
ong-match-front (Next.js)  ──HTTP──▶  ong-match-back (Bun + Hono)  ──HTTP──▶  AI API Center
     UI + wizard + quiz UI              guardrail + quiz gen + grade         ai.develyst.online/chat
                                                │
                                                ▼
                                        PostgreSQL (ong_match_db)
```

- Secrets (`DATABASE_URL`, AI base URL) live in `ong-match-back/.env` (gitignored, never committed).
- AI API Center: `POST /chat` `{ provider?, model?, temperature?, max_tokens?, messages }`
  → `{ success, data: { provider, model, content, usage, latency_ms } }`. No auth.
  Content is a **string**; backend parses strict JSON out of it.

---

## 3. Data Model (PostgreSQL)

```sql
users
  id            uuid pk
  email         text unique not null
  display_name  text
  bio           text
  age           int
  location      text
  avatar_url    text
  activity_level text            -- LOW | MEDIUM | HIGH
  created_at    timestamptz default now()

types
  id               uuid pk
  user_id          uuid fk -> users(id)
  title            text not null       -- e.g. "ชอบเล่นเกมยิงปืน"
  description      text                -- user's elaboration
  level            int not null default 0   -- 0 = not yet passed a quiz
  status           text not null default 'active'  -- active | expired
  first_created_at timestamptz not null default now()
  expires_at       timestamptz not null    -- first_created_at + 30 days
  created_at       timestamptz default now()

type_tags
  type_id  uuid fk -> types(id)
  tag      text
  primary key (type_id, tag)

quizzes
  id            uuid pk
  type_id       uuid fk -> types(id)
  user_id       uuid fk -> users(id)
  questions     jsonb not null      -- [{ id, prompt, choices?, expected, points }]
  status        text not null default 'pending'  -- pending | passed | failed
  score         int                 -- 0..100
  time_limit_sec int not null
  attempt_no    int not null default 1
  started_at    timestamptz
  submitted_at  timestamptz
  created_at    timestamptz default now()
```

- **Expiry** is computed on read: `now() > expires_at ⇒ expired`. A row's `status` is also
  lazily flipped to `expired` when read. No cron needed in Phase 1.
- Re-level does **not** reset `expires_at` or `first_created_at` — leveling up an existing type
  keeps its original 30-day clock.

---

## 4. Backend API (Hono)

Base path `/api/v1`. All responses use the existing envelope `{ success, data }` / `{ success:false, error }`.

| Method & path | Body | Behavior |
|---|---|---|
| `POST /types/validate` | `{ title, description }` | AI **guardrail**: is this a genuine real-world interest? If rejected → `422 { success:false, error, reason }`. If OK → AI generates **tags** + a **quiz (≥3 Q)**. Persists a `types` row (level 0) + `quizzes` row (pending). Returns `{ type, quiz:{ id, questions(no answers), timeLimitSec } }`. |
| `POST /quizzes/:id/submit` | `{ answers, elapsedSec }` | AI **grades** answers (with elapsed time as a signal). If `score ≥ 60` → quiz `passed`, set type `level`, activate. Else `failed`. Returns `{ passed, score, level, feedback[] }`. |
| `POST /types/:id/relevel` | — | Cooldown check (24h since last attempt). Generates a **harder** quiz targeting the next level band. Returns a new pending quiz. |
| `GET /types/me` | — (user via header/session) | List caller's types with `status` + `daysLeft` computed. |
| `GET /tribes` `GET /interests` … | — | Kept for backward-compat where the frontend still needs them; may return derived/empty data in Phase 1. |

**User identity (Phase 1):** frontend sends the logged-in email (NextAuth) via header
`x-user-email`; backend upserts a `users` row by email and treats it as the caller. No password
handling in backend (auth stays at NextAuth mock). This is a Phase-1 shortcut, replaceable later.

---

## 5. AI Integration (backend → AI API Center)

Three purpose-built prompts, each **forces strict JSON** output, low temperature, with a
provider fallback (omit `provider` to use the default `deepseek→xai→gemini→openai` chain, or pin
`gemini-2.5-flash` for speed). Backend extracts the JSON object from `data.content`.

1. **Guardrail** — system prompt: judge whether the (title, description) is a *plausible, real,
   non-offensive* interest/hobby/identity a real person could be deep in. Reject gibberish,
   trolling, hateful, sexual-predatory, or "ไทป์มั่ว" (made-up nonsense). Return
   `{ valid:boolean, reason:string, normalizedTitle:string, tags:string[] }`.
2. **Quiz generation** — given (title, description, targetLevelBand), produce `≥3` Thai questions
   that genuinely test depth (not googleable trivia only), each with `expected` answer/rubric and
   `points`. Return `{ questions:[{id, prompt, choices?, expected, points}], timeLimitSec }`.
3. **Grading** — given (questions, userAnswers, elapsedSec), return
   `{ score:0..100, perQuestion:[{id, correct, note}], suspectedFake:boolean }`.
   Elapsed time far below plausible reading time ⇒ `suspectedFake` ⇒ score penalty.

Robustness: JSON parse failure or AI error → retry once, then fall back to a safe default
(guardrail: reject with generic reason; grading: conservative fail). Never 500 the user flow silently.

---

## 6. Level / Quiz / Anti-Fake Mechanics

- Quiz has **≥3 questions**; **time limit ≈ 20s/question**, shown as a countdown in the UI.
- **Pass threshold:** `score ≥ 60`.
- **Initial level** (first pass): mapped from score, e.g. `level = round(score * 0.4)` → up to ~40.
- **Re-level:** a fresh, harder quiz; on pass, `level = min(100, level + delta(score))`.
  **Cooldown 24h** between attempts per type.
- **Anti-fake signals:** the countdown timer + AI depth questions + `suspectedFake` from grading
  (answered impossibly fast). Timeout or fail ⇒ no level change, retry after cooldown.
- Level is the profile's proof of depth: "ชอบเล่นเกมยิงปืน · lvl 100" = passed hard quizzes, genuinely deep.

---

## 7. Frontend (Next.js) — UI Rework

Direction: **messaging-app aesthetic**, not a management dashboard. Rounded cards/bubbles,
lively accent color, mobile-first nav (bottom tab bar), motion on key actions. Reuse the existing
Mantine `Base*` components and `frontend-design` principles.

- **Create-Type Wizard** (`/onboarding` reworked + reachable from profile):
  1. Name your type → 2. Elaborate (why you're into it) → 3. AI validating (loading, may reject
  with reason) → 4. **Quiz with countdown timer** → 5. Result: level + badge + confetti.
- **Profile:** each type = a card with **level badge**, **expiry countdown** ("เหลือ 23 วัน"),
  and an **"อัปเลเวล"** button (disabled during cooldown).
- **Discover/Home:** simplified in Phase 1 (list people by shared type) — trending/cluster is Phase 2.
- Services keep the mock-fallback pattern so the app still runs if the backend is down.

---

## 8. Verification (per Karpathy goal-driven rule)

- **Backend:** integration test hitting a local Hono server + test DB (or transaction rollback):
  validate → submit(pass) → type active with level>0 & expires_at≈+30d; submit(fail) keeps level 0;
  relevel respects cooldown. Guardrail rejects an obvious "ไทป์มั่ว" fixture.
- **AI adapters:** unit test the JSON-extraction + fallback with recorded/fake AI responses
  (no live AI in unit tests). One live smoke test against `ai.develyst.online` behind a flag.
- **Frontend:** the create-type wizard drives end-to-end against the running backend; timer counts
  down and blocks submit at 0; profile shows level + days-left.
- Nothing is claimed "done" without running these and showing output.

---

## 9. Open Defaults (changeable)
- questions/quiz: 3 · time/question: 20s · pass: 60 · cooldown: 24h · expiry: 30d ·
  initial level map: `score*0.4`. All centralized in a backend `config` module.
```
