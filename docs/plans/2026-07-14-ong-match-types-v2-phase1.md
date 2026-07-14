# Ong Match Types v2 — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Users create their own "ไทป์" (title + elaboration), an AI backend rejects fake types and generates a timed quiz that gates the type, passing grants a level (0–100, re-quizzable to level up), and each type expires 30 days after first creation.

**Architecture:** `ong-match-back` is a Bun + Hono + TypeScript HTTP service backed by PostgreSQL; it owns all AI calls (guardrail / quiz-gen / grading via `ai.develyst.online/chat`), the type/quiz/level/expiry rules, and persistence. `ong-match-front` (Next.js) is reworked to a chat-app aesthetic with a create-type wizard, a countdown quiz UI, and a profile showing level badges + expiry countdowns, calling the backend and falling back to mock data when it is down.

**Tech Stack:** Bun 1.3, Hono, `postgres` (porsager) for DB, `vitest`/`bun:test` for tests, Zod for validation; Next.js 16, React 19, Mantine 9, TanStack Query, Axios.

## Global Constraints

- Backend runtime: **Bun** (not Node). Use `bun test` (bun:test) for backend tests.
- DB connection via `DATABASE_URL` env only — **never** hardcode credentials; `.env` is gitignored.
- AI base URL via `AI_BASE_URL` env (default `https://ai.develyst.online`). No API key needed.
- AI responses: `content` is a string; always parse strict JSON out of it, retry once, then fall back safely. Never throw an unhandled 500 into a user flow.
- Response envelope everywhere: `{ success: true, data }` or `{ success: false, error }` (matches existing frontend `ApiResponse<T>`).
- Defaults centralized in `src/config/rules.ts`: quiz questions ≥3, time 20s/question, pass ≥60, cooldown 24h, expiry 30d, initial level = `round(score*0.4)`.
- Frontend keeps the mock-fallback pattern in every service.
- Caller identity: frontend sends `x-user-email` header; backend upserts a `users` row by email.

---

## PART A — Backend (`ong-match-back`)

### Task A1: Project scaffold + health route

**Files:**
- Create: `ong-match-back/package.json`, `ong-match-back/tsconfig.json`, `ong-match-back/.env.example`, `ong-match-back/.env`
- Create: `ong-match-back/src/index.ts`, `ong-match-back/src/app.ts`
- Test: `ong-match-back/test/health.test.ts`

**Interfaces:**
- Produces: `createApp(): Hono` — the app factory used by every route test and by `index.ts`.

- [ ] **Step 1: Init deps**

Run:
```bash
cd ong-match-back
bun init -y
bun add hono postgres zod
bun add -d @types/bun
```

- [ ] **Step 2: Write failing test** — `test/health.test.ts`

```ts
import { describe, it, expect } from "bun:test";
import { createApp } from "../src/app";

describe("health", () => {
  it("GET /health returns ok", async () => {
    const app = createApp();
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, data: { status: "ok" } });
  });
});
```

- [ ] **Step 3: Run test, verify FAIL**

Run: `bun test test/health.test.ts`
Expected: FAIL — cannot find `../src/app`.

- [ ] **Step 4: Implement `src/app.ts`**

```ts
import { Hono } from "hono";

export function createApp(): Hono {
  const app = new Hono();
  app.get("/health", (c) => c.json({ success: true, data: { status: "ok" } }));
  return app;
}
```

- [ ] **Step 5: Implement `src/index.ts`**

```ts
import { createApp } from "./app";

const port = Number(process.env.PORT ?? 3010);
const app = createApp();
console.log(`ong-match-back listening on :${port}`);
export default { port, fetch: app.fetch };
```

- [ ] **Step 6: `.env.example` (committed) and `.env` (gitignored)**

`.env.example`:
```
PORT=3010
DATABASE_URL=postgresql://user:pass@host:5432/ong_match_db
AI_BASE_URL=https://ai.develyst.online
```
`.env` (real values — the provided DATABASE_URL; ensure `.env` is in `.gitignore`).

- [ ] **Step 7: Run test, verify PASS**

Run: `bun test test/health.test.ts` → PASS.

- [ ] **Step 8: Commit**

```bash
git add package.json tsconfig.json .env.example src test .gitignore
git commit -m "feat(back): scaffold Bun+Hono app with health route"
```

---

### Task A2: DB pool + schema migration

**Files:**
- Create: `ong-match-back/src/db/client.ts`, `ong-match-back/src/db/schema.sql`, `ong-match-back/src/db/migrate.ts`
- Test: `ong-match-back/test/db.test.ts`

**Interfaces:**
- Produces: `sql` — a `postgres` tagged-template client (from `src/db/client.ts`).
- Produces: `migrate(): Promise<void>` — applies `schema.sql` idempotently.

- [ ] **Step 1: Write `src/db/client.ts`**

```ts
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is required");

export const sql = postgres(url, { max: 5, idle_timeout: 20 });
```

- [ ] **Step 2: Write `src/db/schema.sql`** (verbatim from design §3)

```sql
create extension if not exists "pgcrypto";

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  display_name text,
  bio text,
  age int,
  location text,
  avatar_url text,
  activity_level text,
  created_at timestamptz not null default now()
);

create table if not exists types (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  title text not null,
  description text,
  level int not null default 0,
  status text not null default 'active',
  first_created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists type_tags (
  type_id uuid not null references types(id) on delete cascade,
  tag text not null,
  primary key (type_id, tag)
);

create table if not exists quizzes (
  id uuid primary key default gen_random_uuid(),
  type_id uuid not null references types(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  questions jsonb not null,
  status text not null default 'pending',
  score int,
  time_limit_sec int not null,
  attempt_no int not null default 1,
  started_at timestamptz,
  submitted_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_types_user on types(user_id);
create index if not exists idx_quizzes_type on quizzes(type_id);
```

- [ ] **Step 3: Write `src/db/migrate.ts`**

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { sql } from "./client";

export async function migrate(): Promise<void> {
  const ddl = readFileSync(join(import.meta.dir, "schema.sql"), "utf8");
  await sql.unsafe(ddl);
}

if (import.meta.main) {
  migrate().then(() => { console.log("migrated"); process.exit(0); })
    .catch((e) => { console.error(e); process.exit(1); });
}
```

- [ ] **Step 4: Write test `test/db.test.ts`** (requires live DB; guarded)

```ts
import { describe, it, expect } from "bun:test";
import { migrate } from "../src/db/migrate";
import { sql } from "../src/db/client";

describe("db", () => {
  it("migrate creates tables", async () => {
    await migrate();
    const rows = await sql`select table_name from information_schema.tables where table_name in ('users','types','quizzes','type_tags')`;
    expect(rows.length).toBe(4);
  });
});
```

- [ ] **Step 5: Run migrate + test**

Run: `bun run src/db/migrate.ts` then `bun test test/db.test.ts`
Expected: "migrated" then PASS. (If DB unreachable, note it and confirm network to `154.197.124.206:5432`.)

- [ ] **Step 6: Commit**

```bash
git add src/db test/db.test.ts
git commit -m "feat(back): postgres client + schema migration"
```

---

### Task A3: Config rules + user repo

**Files:**
- Create: `ong-match-back/src/config/rules.ts`, `ong-match-back/src/repo/users.ts`
- Test: `ong-match-back/test/users.test.ts`

**Interfaces:**
- Produces: `RULES` — `{ minQuestions:3, secPerQuestion:20, passScore:60, cooldownHours:24, expiryDays:30, initialLevel(score:number):number, relevelDelta(score:number):number }`.
- Produces: `upsertUserByEmail(email:string): Promise<{id:string; email:string}>`.

- [ ] **Step 1: Write `src/config/rules.ts`**

```ts
export const RULES = {
  minQuestions: 3,
  secPerQuestion: 20,
  passScore: 60,
  cooldownHours: 24,
  expiryDays: 30,
  initialLevel: (score: number) => Math.round(score * 0.4),
  relevelDelta: (score: number) => Math.round((score - 50) * 0.3),
} as const;
```

- [ ] **Step 2: Write failing test `test/users.test.ts`**

```ts
import { describe, it, expect } from "bun:test";
import { upsertUserByEmail } from "../src/repo/users";
import { migrate } from "../src/db/migrate";

describe("users", () => {
  it("upsert is idempotent by email", async () => {
    await migrate();
    const a = await upsertUserByEmail("dev@smartalliance.co.th");
    const b = await upsertUserByEmail("dev@smartalliance.co.th");
    expect(a.id).toBe(b.id);
    expect(a.email).toBe("dev@smartalliance.co.th");
  });
});
```

- [ ] **Step 3: Run, verify FAIL** — `bun test test/users.test.ts`

- [ ] **Step 4: Implement `src/repo/users.ts`**

```ts
import { sql } from "../db/client";

export async function upsertUserByEmail(email: string): Promise<{ id: string; email: string }> {
  const rows = await sql<{ id: string; email: string }[]>`
    insert into users (email) values (${email})
    on conflict (email) do update set email = excluded.email
    returning id, email`;
  return rows[0];
}
```

- [ ] **Step 5: Run, verify PASS. Commit**

```bash
git add src/config/rules.ts src/repo/users.ts test/users.test.ts
git commit -m "feat(back): rules config + user upsert repo"
```

---

### Task A4: AI client + JSON extraction (unit-tested, no live AI)

**Files:**
- Create: `ong-match-back/src/ai/client.ts`, `ong-match-back/src/ai/json.ts`
- Test: `ong-match-back/test/ai-json.test.ts`

**Interfaces:**
- Produces: `chat(messages, opts?): Promise<string>` — posts to `${AI_BASE_URL}/chat`, returns `data.content`.
- Produces: `extractJson<T>(content:string): T` — pulls the first balanced `{...}` block and `JSON.parse`s it (tolerates ```json fences / prose around it). Throws `JsonExtractError` on failure.

- [ ] **Step 1: Write failing test `test/ai-json.test.ts`**

```ts
import { describe, it, expect } from "bun:test";
import { extractJson } from "../src/ai/json";

describe("extractJson", () => {
  it("parses fenced json with surrounding prose", () => {
    const s = 'นี่คือผลลัพธ์:\n```json\n{"valid": true, "tags": ["a","b"]}\n```\nจบ';
    expect(extractJson<{ valid: boolean }>(s)).toEqual({ valid: true, tags: ["a", "b"] } as any);
  });
  it("parses bare json", () => {
    expect(extractJson('{"score":80}')).toEqual({ score: 80 } as any);
  });
  it("throws on no json", () => {
    expect(() => extractJson("ไม่มี json")).toThrow();
  });
});
```

- [ ] **Step 2: Run, verify FAIL.**

- [ ] **Step 3: Implement `src/ai/json.ts`**

```ts
export class JsonExtractError extends Error {}

export function extractJson<T>(content: string): T {
  const start = content.indexOf("{");
  if (start === -1) throw new JsonExtractError("no object found");
  let depth = 0;
  for (let i = start; i < content.length; i++) {
    if (content[i] === "{") depth++;
    else if (content[i] === "}") {
      depth--;
      if (depth === 0) {
        try { return JSON.parse(content.slice(start, i + 1)) as T; }
        catch (e) { throw new JsonExtractError(String(e)); }
      }
    }
  }
  throw new JsonExtractError("unbalanced braces");
}
```

- [ ] **Step 4: Implement `src/ai/client.ts`**

```ts
const AI_BASE_URL = process.env.AI_BASE_URL ?? "https://ai.develyst.online";

export interface ChatMsg { role: "system" | "user" | "assistant"; content: string; }
export interface ChatOpts { provider?: string; model?: string; temperature?: number; maxTokens?: number; }

export async function chat(messages: ChatMsg[], opts: ChatOpts = {}): Promise<string> {
  const res = await fetch(`${AI_BASE_URL}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      provider: opts.provider, model: opts.model,
      temperature: opts.temperature ?? 0.3, max_tokens: opts.maxTokens ?? 1024,
      messages,
    }),
  });
  const body = await res.json();
  if (!body?.success || !body?.data?.content) throw new Error(body?.error ?? "AI call failed");
  return body.data.content as string;
}
```

- [ ] **Step 5: Run, verify PASS. Commit**

```bash
git add src/ai test/ai-json.test.ts
git commit -m "feat(back): AI chat client + robust JSON extraction"
```

---

### Task A5: AI services — guardrail, quiz-gen, grade (with fallbacks)

**Files:**
- Create: `ong-match-back/src/ai/prompts.ts`, `ong-match-back/src/ai/types-ai.ts`
- Test: `ong-match-back/test/types-ai.test.ts` (injects a fake `chat` — no live AI)

**Interfaces:**
- Produces:
  - `validateType(chatFn, title, description): Promise<{valid:boolean; reason:string; normalizedTitle:string; tags:string[]}>`
  - `generateQuiz(chatFn, title, description, band): Promise<{questions: QuizQuestion[]; timeLimitSec:number}>`
  - `gradeQuiz(chatFn, questions, answers, elapsedSec): Promise<{score:number; perQuestion:{id:string;correct:boolean;note:string}[]; suspectedFake:boolean}>`
  - `QuizQuestion = { id:string; prompt:string; choices?:string[]; expected:string; points:number }`
  - `chatFn` type = the `chat` signature from A4, injected for testability.

- [ ] **Step 1: Write `src/ai/prompts.ts`** (system prompts, Thai, strict-JSON demands)

```ts
export const GUARDRAIL_SYS = `คุณเป็นผู้ตรวจสอบ "ไทป์" (ความสนใจ/ตัวตน) ของผู้ใช้แอปหาเพื่อน.
ตัดสินว่าไทป์นี้เป็นความสนใจ/งานอดิเรก/ตัวตนที่ "มีจริง" และเหมาะสมไหม.
ปฏิเสธ: คำมั่ว, ตัวอักษรสุ่ม, ล้อเล่น, เนื้อหาไม่เหมาะสม/รุนแรง/ทางเพศ/ผิดกฎหมาย, หรือไทป์ที่คนจริงไม่น่ามี.
ตอบกลับเป็น JSON เท่านั้น ห้ามมีข้อความอื่น:
{"valid": boolean, "reason": "เหตุผลสั้นๆภาษาไทย", "normalizedTitle": "ชื่อไทป์ที่เรียบเรียงแล้ว", "tags": ["แท็กภาษาไทย 3-8 อัน กว้างไปแคบ"]}`;

export const QUIZGEN_SYS = `สร้างแบบทดสอบวัด "ความลึก" ในไทป์ที่กำหนด เป็นภาษาไทย.
ต้องมีอย่างน้อย 3 ข้อ, วัดความรู้/ประสบการณ์จริง ไม่ใช่ถามลอยๆที่เดาได้.
ตอบเป็น JSON เท่านั้น:
{"questions":[{"id":"q1","prompt":"...","choices":["ก","ข","ค","ง"],"expected":"คำตอบ/เกณฑ์ที่ถูก","points":10}], "timeLimitSec": <number>}`;

export const GRADE_SYS = `ตรวจให้คะแนนคำตอบแบบทดสอบไทป์ (0-100).
พิจารณาความถูกต้องและความลึก. ถ้า elapsedSec น้อยผิดปกติจนตอบไม่ทันอ่าน ให้ตั้ง suspectedFake=true และหักคะแนน.
ตอบเป็น JSON เท่านั้น:
{"score": number, "perQuestion":[{"id":"q1","correct":boolean,"note":"สั้นๆ"}], "suspectedFake": boolean}`;
```

- [ ] **Step 2: Write failing test `test/types-ai.test.ts`** — inject fake chatFn

```ts
import { describe, it, expect } from "bun:test";
import { validateType, generateQuiz, gradeQuiz } from "../src/ai/types-ai";

const fake = (reply: string) => async () => reply;

describe("types-ai", () => {
  it("validateType parses a valid verdict", async () => {
    const r = await validateType(fake('{"valid":true,"reason":"ok","normalizedTitle":"ชอบเล่นกีตาร์","tags":["กีตาร์","ดนตรี"]}'), "กีตาร์", "เล่นมา 5 ปี");
    expect(r.valid).toBe(true);
    expect(r.tags).toContain("ดนตรี");
  });

  it("validateType falls back to reject on bad JSON", async () => {
    const r = await validateType(fake("พังไม่เป็น json"), "x", "y");
    expect(r.valid).toBe(false);
  });

  it("generateQuiz enforces >=3 questions (fallback pads if fewer)", async () => {
    const r = await generateQuiz(fake('{"questions":[{"id":"q1","prompt":"a","expected":"x","points":10}],"timeLimitSec":60}'), "กีตาร์", "desc", "beginner");
    expect(r.questions.length).toBeGreaterThanOrEqual(3);
  });

  it("gradeQuiz clamps score and defaults suspectedFake", async () => {
    const r = await gradeQuiz(fake('{"score":150,"perQuestion":[],"suspectedFake":false}'), [], [], 100);
    expect(r.score).toBe(100);
  });

  it("gradeQuiz fails safe on bad JSON", async () => {
    const r = await gradeQuiz(fake("nope"), [], [], 100);
    expect(r.score).toBe(0);
  });
});
```

- [ ] **Step 3: Run, verify FAIL.**

- [ ] **Step 4: Implement `src/ai/types-ai.ts`**

```ts
import { extractJson } from "./json";
import { GUARDRAIL_SYS, QUIZGEN_SYS, GRADE_SYS } from "./prompts";

export interface QuizQuestion { id: string; prompt: string; choices?: string[]; expected: string; points: number; }
type ChatFn = (messages: { role: "system" | "user" | "assistant"; content: string }[]) => Promise<string>;

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, Math.round(n)));

export async function validateType(chatFn: ChatFn, title: string, description: string) {
  try {
    const out = await chatFn([
      { role: "system", content: GUARDRAIL_SYS },
      { role: "user", content: `title: ${title}\ndescription: ${description}` },
    ]);
    const j = extractJson<any>(out);
    return {
      valid: !!j.valid,
      reason: String(j.reason ?? ""),
      normalizedTitle: String(j.normalizedTitle ?? title),
      tags: Array.isArray(j.tags) ? j.tags.map(String).slice(0, 8) : [],
    };
  } catch {
    return { valid: false, reason: "ระบบตรวจไทป์ไม่สำเร็จ ลองใหม่อีกครั้ง", normalizedTitle: title, tags: [] };
  }
}

export async function generateQuiz(chatFn: ChatFn, title: string, description: string, band: string) {
  try {
    const out = await chatFn([
      { role: "system", content: QUIZGEN_SYS },
      { role: "user", content: `title: ${title}\ndescription: ${description}\nระดับ: ${band}` },
    ]);
    const j = extractJson<any>(out);
    let questions: QuizQuestion[] = Array.isArray(j.questions) ? j.questions : [];
    while (questions.length < 3) {
      const n = questions.length + 1;
      questions.push({ id: `q${n}`, prompt: `เล่าประสบการณ์ของคุณเกี่ยวกับ ${title} (ข้อ ${n})`, expected: "", points: 10 });
    }
    return { questions, timeLimitSec: Number(j.timeLimitSec) || questions.length * 20 };
  } catch {
    const questions: QuizQuestion[] = [1, 2, 3].map((n) => ({
      id: `q${n}`, prompt: `เล่าเกี่ยวกับ ${title} เชิงลึก (ข้อ ${n})`, expected: "", points: 10,
    }));
    return { questions, timeLimitSec: 60 };
  }
}

export async function gradeQuiz(chatFn: ChatFn, questions: QuizQuestion[], answers: unknown[], elapsedSec: number) {
  try {
    const out = await chatFn([
      { role: "system", content: GRADE_SYS },
      { role: "user", content: JSON.stringify({ questions, answers, elapsedSec }) },
    ]);
    const j = extractJson<any>(out);
    return {
      score: clamp(Number(j.score) || 0),
      perQuestion: Array.isArray(j.perQuestion) ? j.perQuestion : [],
      suspectedFake: !!j.suspectedFake,
    };
  } catch {
    return { score: 0, perQuestion: [], suspectedFake: false };
  }
}
```

- [ ] **Step 5: Run, verify PASS. Commit**

```bash
git add src/ai/prompts.ts src/ai/types-ai.ts test/types-ai.test.ts
git commit -m "feat(back): AI guardrail/quiz-gen/grading services with safe fallbacks"
```

---

### Task A6: Types repo (create/list/expiry) + quiz repo

**Files:**
- Create: `ong-match-back/src/repo/types.ts`, `ong-match-back/src/repo/quizzes.ts`
- Test: `ong-match-back/test/types-repo.test.ts`

**Interfaces:**
- Produces (`repo/types.ts`):
  - `createType(userId, title, description, tags): Promise<TypeRow>` — sets `expires_at = now()+30d`, level 0.
  - `listMyTypes(userId): Promise<(TypeRow & {daysLeft:number; status:string})[]>` — recomputes expiry on read.
  - `setLevel(typeId, level): Promise<void>`
  - `getType(typeId): Promise<TypeRow|null>`
  - `TypeRow = { id, user_id, title, description, level, status, first_created_at, expires_at }`
- Produces (`repo/quizzes.ts`):
  - `createQuiz(typeId, userId, questions, timeLimitSec, attemptNo): Promise<QuizRow>`
  - `getQuiz(id): Promise<QuizRow|null>`
  - `markGraded(id, status, score): Promise<void>`
  - `lastAttemptAt(typeId): Promise<Date|null>`

- [ ] **Step 1: Write failing test `test/types-repo.test.ts`**

```ts
import { describe, it, expect } from "bun:test";
import { migrate } from "../src/db/migrate";
import { upsertUserByEmail } from "../src/repo/users";
import { createType, listMyTypes, setLevel } from "../src/repo/types";

describe("types-repo", () => {
  it("creates a type with ~30d expiry and lists it", async () => {
    await migrate();
    const u = await upsertUserByEmail(`t${Date.now()}@x.co`);
    const t = await createType(u.id, "ชอบเล่นกีตาร์", "เล่นมานาน", ["กีตาร์", "ดนตรี"]);
    await setLevel(t.id, 40);
    const list = await listMyTypes(u.id);
    const found = list.find((x) => x.id === t.id)!;
    expect(found.level).toBe(40);
    expect(found.daysLeft).toBeGreaterThan(28);
    expect(found.status).toBe("active");
  });
});
```

- [ ] **Step 2: Run, verify FAIL.**

- [ ] **Step 3: Implement `src/repo/types.ts`**

```ts
import { sql } from "../db/client";
import { RULES } from "../config/rules";

export interface TypeRow {
  id: string; user_id: string; title: string; description: string | null;
  level: number; status: string; first_created_at: string; expires_at: string;
}

export async function createType(userId: string, title: string, description: string, tags: string[]): Promise<TypeRow> {
  const rows = await sql<TypeRow[]>`
    insert into types (user_id, title, description, expires_at)
    values (${userId}, ${title}, ${description}, now() + ${`${RULES.expiryDays} days`}::interval)
    returning *`;
  const t = rows[0];
  if (tags.length) {
    await sql`insert into type_tags ${sql(tags.map((tag) => ({ type_id: t.id, tag })))} on conflict do nothing`;
  }
  return t;
}

export async function getType(typeId: string): Promise<TypeRow | null> {
  const rows = await sql<TypeRow[]>`select * from types where id = ${typeId}`;
  return rows[0] ?? null;
}

export async function setLevel(typeId: string, level: number): Promise<void> {
  await sql`update types set level = ${level} where id = ${typeId}`;
}

export async function listMyTypes(userId: string) {
  const rows = await sql<(TypeRow & { days_left: number })[]>`
    select *, greatest(0, ceil(extract(epoch from (expires_at - now())) / 86400))::int as days_left
    from types where user_id = ${userId} order by created_at desc`;
  return rows.map((r) => {
    const status = new Date(r.expires_at) < new Date() ? "expired" : "active";
    return { ...r, status, daysLeft: r.days_left };
  });
}
```

- [ ] **Step 4: Implement `src/repo/quizzes.ts`**

```ts
import { sql } from "../db/client";
import type { QuizQuestion } from "../ai/types-ai";

export interface QuizRow {
  id: string; type_id: string; user_id: string; questions: QuizQuestion[];
  status: string; score: number | null; time_limit_sec: number; attempt_no: number;
  started_at: string | null; submitted_at: string | null;
}

export async function createQuiz(typeId: string, userId: string, questions: QuizQuestion[], timeLimitSec: number, attemptNo: number): Promise<QuizRow> {
  const rows = await sql<QuizRow[]>`
    insert into quizzes (type_id, user_id, questions, time_limit_sec, attempt_no, started_at)
    values (${typeId}, ${userId}, ${sql.json(questions as any)}, ${timeLimitSec}, ${attemptNo}, now())
    returning *`;
  return rows[0];
}

export async function getQuiz(id: string): Promise<QuizRow | null> {
  const rows = await sql<QuizRow[]>`select * from quizzes where id = ${id}`;
  return rows[0] ?? null;
}

export async function markGraded(id: string, status: string, score: number): Promise<void> {
  await sql`update quizzes set status = ${status}, score = ${score}, submitted_at = now() where id = ${id}`;
}

export async function lastAttemptAt(typeId: string): Promise<Date | null> {
  const rows = await sql<{ created_at: string }[]>`
    select created_at from quizzes where type_id = ${typeId} order by created_at desc limit 1`;
  return rows[0] ? new Date(rows[0].created_at) : null;
}
```

- [ ] **Step 5: Run, verify PASS. Commit**

```bash
git add src/repo/types.ts src/repo/quizzes.ts test/types-repo.test.ts
git commit -m "feat(back): types + quizzes repositories with expiry-on-read"
```

---

### Task A7: Routes — validate / submit / relevel / list + wire into app

**Files:**
- Create: `ong-match-back/src/routes/types.ts`, `ong-match-back/src/middleware/user.ts`
- Modify: `ong-match-back/src/app.ts` (mount routes + CORS)
- Test: `ong-match-back/test/types-routes.test.ts`

**Interfaces:**
- Consumes: everything from A3–A6 + `chat` from A4.
- Produces HTTP: `POST /api/v1/types/validate`, `POST /api/v1/quizzes/:id/submit`, `POST /api/v1/types/:id/relevel`, `GET /api/v1/types/me`.
- `userMiddleware` reads `x-user-email`, upserts user, sets `c.set("userId", id)`.

- [ ] **Step 1: Write failing test `test/types-routes.test.ts`** (inject fake AI via env or module — here use a real createApp but stub `chat` through a DI param)

```ts
import { describe, it, expect } from "bun:test";
import { migrate } from "../src/db/migrate";
import { createApp } from "../src/app";

const H = { "Content-Type": "application/json", "x-user-email": `r${Date.now()}@x.co` };

// createApp accepts an optional chatFn override for tests.
const okChat = async (msgs: any[]) => {
  const sys = msgs[0].content as string;
  if (sys.includes("ตรวจสอบ")) return '{"valid":true,"reason":"ok","normalizedTitle":"ชอบเล่นกีตาร์","tags":["กีตาร์"]}';
  if (sys.includes("แบบทดสอบวัด")) return '{"questions":[{"id":"q1","prompt":"a","expected":"x","points":10},{"id":"q2","prompt":"b","expected":"y","points":10},{"id":"q3","prompt":"c","expected":"z","points":10}],"timeLimitSec":60}';
  return '{"score":80,"perQuestion":[],"suspectedFake":false}';
};

describe("types routes", () => {
  it("validate -> submit(pass) yields level>0 and active type", async () => {
    await migrate();
    const app = createApp(okChat);
    const v = await app.request("/api/v1/types/validate", {
      method: "POST", headers: H,
      body: JSON.stringify({ title: "กีตาร์", description: "เล่นมา 5 ปี" }),
    });
    expect(v.status).toBe(200);
    const vb = await v.json();
    const quizId = vb.data.quiz.id;
    expect(vb.data.quiz.questions.length).toBeGreaterThanOrEqual(3);
    expect(vb.data.quiz.questions[0].expected).toBeUndefined(); // answers stripped

    const s = await app.request(`/api/v1/quizzes/${quizId}/submit`, {
      method: "POST", headers: H,
      body: JSON.stringify({ answers: ["a", "b", "c"], elapsedSec: 40 }),
    });
    const sb = await s.json();
    expect(sb.data.passed).toBe(true);
    expect(sb.data.level).toBeGreaterThan(0);

    const me = await app.request("/api/v1/types/me", { headers: H });
    const mb = await me.json();
    expect(mb.data.some((t: any) => t.level > 0 && t.daysLeft > 28)).toBe(true);
  });

  it("validate rejects fake type", async () => {
    const rejectChat = async () => '{"valid":false,"reason":"ไทป์มั่ว","normalizedTitle":"x","tags":[]}';
    const app = createApp(rejectChat);
    const v = await app.request("/api/v1/types/validate", {
      method: "POST", headers: H, body: JSON.stringify({ title: "asdkjh", description: "zzz" }),
    });
    expect(v.status).toBe(422);
  });
});
```

- [ ] **Step 2: Run, verify FAIL.**

- [ ] **Step 3: Implement `src/middleware/user.ts`**

```ts
import type { Context, Next } from "hono";
import { upsertUserByEmail } from "../repo/users";

export async function userMiddleware(c: Context, next: Next) {
  const email = c.req.header("x-user-email");
  if (!email) return c.json({ success: false, error: "missing x-user-email" }, 401);
  const u = await upsertUserByEmail(email);
  c.set("userId", u.id);
  await next();
}
```

- [ ] **Step 4: Implement `src/routes/types.ts`**

```ts
import { Hono } from "hono";
import { z } from "zod";
import { userMiddleware } from "../middleware/user";
import { validateType, generateQuiz, gradeQuiz } from "../ai/types-ai";
import { createType, getType, setLevel, listMyTypes } from "../repo/types";
import { createQuiz, getQuiz, markGraded, lastAttemptAt } from "../repo/quizzes";
import { RULES } from "../config/rules";
import type { ChatMsg } from "../ai/client";

type ChatFn = (m: ChatMsg[]) => Promise<string>;

const stripAnswers = (qs: any[]) => qs.map(({ expected, ...rest }) => rest);

export function typesRoutes(chatFn: ChatFn) {
  const r = new Hono<{ Variables: { userId: string } }>();
  r.use("*", userMiddleware);

  r.post("/types/validate", async (c) => {
    const body = z.object({ title: z.string().min(1), description: z.string().default("") }).parse(await c.req.json());
    const verdict = await validateType(chatFn, body.title, body.description);
    if (!verdict.valid) return c.json({ success: false, error: verdict.reason }, 422);
    const userId = c.get("userId");
    const type = await createType(userId, verdict.normalizedTitle, body.description, verdict.tags);
    const quiz = await generateQuiz(chatFn, verdict.normalizedTitle, body.description, "beginner");
    const saved = await createQuiz(type.id, userId, quiz.questions, quiz.timeLimitSec, 1);
    return c.json({ success: true, data: { type, quiz: { id: saved.id, questions: stripAnswers(quiz.questions), timeLimitSec: quiz.timeLimitSec } } });
  });

  r.post("/quizzes/:id/submit", async (c) => {
    const id = c.req.param("id");
    const body = z.object({ answers: z.array(z.any()), elapsedSec: z.number() }).parse(await c.req.json());
    const quiz = await getQuiz(id);
    if (!quiz) return c.json({ success: false, error: "quiz not found" }, 404);
    const graded = await gradeQuiz(chatFn, quiz.questions, body.answers, body.elapsedSec);
    const passed = graded.score >= RULES.passScore && !graded.suspectedFake;
    await markGraded(id, passed ? "passed" : "failed", graded.score);
    let level = 0;
    if (passed) {
      const t = await getType(quiz.type_id);
      level = quiz.attempt_no === 1
        ? RULES.initialLevel(graded.score)
        : Math.min(100, (t?.level ?? 0) + Math.max(0, RULES.relevelDelta(graded.score)));
      await setLevel(quiz.type_id, level);
    }
    return c.json({ success: true, data: { passed, score: graded.score, level, feedback: graded.perQuestion } });
  });

  r.post("/types/:id/relevel", async (c) => {
    const typeId = c.req.param("id");
    const type = await getType(typeId);
    if (!type) return c.json({ success: false, error: "type not found" }, 404);
    const last = await lastAttemptAt(typeId);
    if (last && Date.now() - last.getTime() < RULES.cooldownHours * 3600_000) {
      return c.json({ success: false, error: `รออีก ${RULES.cooldownHours} ชม. ก่อนอัปเลเวล` }, 429);
    }
    const userId = c.get("userId");
    const attempts = 2; // next attempt; relevel always harder
    const quiz = await generateQuiz(chatFn, type.title, type.description ?? "", `level ${type.level}+`);
    const saved = await createQuiz(typeId, userId, quiz.questions, quiz.timeLimitSec, attempts);
    return c.json({ success: true, data: { quiz: { id: saved.id, questions: stripAnswers(quiz.questions), timeLimitSec: quiz.timeLimitSec } } });
  });

  r.get("/types/me", async (c) => {
    const list = await listMyTypes(c.get("userId"));
    return c.json({ success: true, data: list });
  });

  return r;
}
```

- [ ] **Step 5: Modify `src/app.ts`** — accept optional `chatFn`, mount routes + CORS

```ts
import { Hono } from "hono";
import { cors } from "hono/cors";
import { typesRoutes } from "./routes/types";
import { chat } from "./ai/client";
import type { ChatMsg } from "./ai/client";

export function createApp(chatFn: (m: ChatMsg[]) => Promise<string> = chat): Hono {
  const app = new Hono();
  app.use("*", cors());
  app.get("/health", (c) => c.json({ success: true, data: { status: "ok" } }));
  app.route("/api/v1", typesRoutes(chatFn));
  return app;
}
```

- [ ] **Step 6: Run, verify PASS.** `bun test test/types-routes.test.ts`

- [ ] **Step 7: Live AI smoke (manual, flagged)** — start server, curl validate with a real interest; confirm quiz returns. Document in README.

```bash
bun run src/index.ts &
curl -s -XPOST localhost:3010/api/v1/types/validate -H 'content-type: application/json' -H 'x-user-email: dev@smartalliance.co.th' -d '{"title":"ชอบเล่นกีตาร์","description":"เล่นมา 5 ปี ชอบ fingerstyle"}' | head
```

- [ ] **Step 8: Commit**

```bash
git add src/routes src/middleware src/app.ts test/types-routes.test.ts
git commit -m "feat(back): type validate/submit/relevel/list routes with AI DI"
```

---

## PART B — Frontend (`ong-match-front`)

### Task B1: Wire real backend base URL + user-email header + type/quiz types

**Files:**
- Modify: `ong-match-front/src/lib/api/client.ts` (base URL default → `http://localhost:3010`)
- Modify: `ong-match-front/src/lib/api/interceptor.ts` (attach `x-user-email` from session)
- Create: `ong-match-front/src/types/api/main/quiz.ts`
- Create: `ong-match-front/src/lib/api/api-types.ts` (validate/submit/relevel/listMyTypes calls)
- Test: `ong-match-front/src/lib/api/__tests__/api-types.test.ts` (mock axios)

**Interfaces:**
- Produces: `validateTypeApi`, `submitQuizApi`, `relevelApi`, `getMyTypesApi` (axios wrappers matching backend paths).
- Produces types: `QuizQuestionDTO {id,prompt,choices?}`, `ValidateTypeResponse {type, quiz:{id,questions,timeLimitSec}}`, `SubmitQuizResponse {passed,score,level,feedback}`, `MyType {id,title,description,level,status,daysLeft}`.

- [ ] **Step 1–5:** Follow the same TDD loop — write a mocked-axios test asserting each wrapper hits the right URL/method/body, run FAIL, implement wrappers in `api-types.ts`, run PASS, commit. Base URL env: `NEXT_PUBLIC_API_BASE_URL` (already read in `client.ts`); set `.env.local` → `http://localhost:3010`. Interceptor pulls email from `next-auth` session (client) or a `getSession()` helper and sets `config.headers["x-user-email"]`.

```ts
// api-types.ts (implementation target)
import { mainClient } from "./client";
import type { ApiResponse } from "@/types/api/main/common";
import type { ValidateTypeResponse, SubmitQuizResponse, MyType } from "@/types/api/main/quiz";

export const validateTypeApi = (b: { title: string; description: string }) =>
  mainClient.post<ApiResponse<ValidateTypeResponse>>("/api/v1/types/validate", b);
export const submitQuizApi = (id: string, b: { answers: unknown[]; elapsedSec: number }) =>
  mainClient.post<ApiResponse<SubmitQuizResponse>>(`/api/v1/quizzes/${id}/submit`, b);
export const relevelApi = (id: string) =>
  mainClient.post<ApiResponse<{ quiz: ValidateTypeResponse["quiz"] }>>(`/api/v1/types/${id}/relevel`);
export const getMyTypesApi = () =>
  mainClient.get<ApiResponse<MyType[]>>("/api/v1/types/me");
```

Commit: `feat(front): backend type/quiz API wrappers + user-email header`.

---

### Task B2: `useTypeCreation` + `useMyTypes` hooks (TanStack Query)

**Files:**
- Create: `ong-match-front/src/hooks/type/useTypeCreation.ts`, `ong-match-front/src/hooks/type/useMyTypes.ts`, `ong-match-front/src/hooks/type/index.ts`
- Create: `ong-match-front/src/services/type.service.ts` (mock-fallback wrappers around api-types)
- Test: `ong-match-front/src/services/__tests__/type.service.test.ts`

**Interfaces:**
- Produces: `useTypeCreation()` → `{ validate(input), submitQuiz(id,payload), relevel(id), state }` (mutations).
- Produces: `useMyTypes()` → `{ types: MyType[], isLoading }`.
- Produces service fns `validateType`, `submitQuiz`, `relevel`, `getMyTypes` with mock fallback (mock quiz with 3 canned questions + a mock level) so the wizard runs offline.

- [ ] TDD: test the service mock-fallback (axios rejects → returns mock quiz with ≥3 questions), FAIL→implement→PASS→commit. Hooks are thin wrappers over mutations/`useQuery`; snapshot/lightweight test optional. Commit: `feat(front): type creation + my-types hooks with mock fallback`.

---

### Task B3: Create-Type Wizard (steps 1–3: name → elaborate → AI validating)

**Files:**
- Create: `ong-match-front/src/components/partials/CreateType/CreateTypeWizard.tsx`, `.../StepName.tsx`, `.../StepElaborate.tsx`, `.../StepValidating.tsx`, `.../index.ts`
- Modify: `ong-match-front/src/app/(main)/onboarding/page.tsx` (render the wizard)

**Interfaces:**
- Consumes: `useTypeCreation` from B2.
- Produces: `<CreateTypeWizard onDone={(result) => ...} />` — orchestrates step state `name → elaborate → validating → quiz → result`.

- [ ] Build steps with Mantine, chat-app styling (rounded, single-column, progress dots). Step 3 calls `validate()`; on 422 show the AI reason inline and let the user edit; on success advance to quiz carrying `quiz`. No live-server test here; verify by driving the UI in B6. Commit per step. Commit: `feat(front): create-type wizard steps 1-3`.

---

### Task B4: Timed Quiz UI (step 4) with countdown

**Files:**
- Create: `ong-match-front/src/components/partials/CreateType/StepQuiz.tsx`, `.../QuizTimer.tsx`
- Create: `ong-match-front/src/hooks/common/useCountdown.ts`
- Test: `ong-match-front/src/hooks/common/__tests__/useCountdown.test.ts`

**Interfaces:**
- Produces: `useCountdown(seconds, onExpire)` → `{ remaining, start, running }` (uses `setInterval`, cleans up).
- Produces: `<StepQuiz quiz={...} onSubmit={(answers, elapsedSec) => ...} />` — renders one question at a time or a list, disables submit and auto-submits at 0.

- [ ] **Step 1:** Write `useCountdown` test with fake timers (advance time → remaining decrements → onExpire fires at 0). FAIL.
- [ ] **Step 2:** Implement `useCountdown`. PASS.
- [ ] **Step 3:** Implement `StepQuiz`: renders questions, tracks `answers`, shows `<QuizTimer remaining=.../>` prominently (turns red < 5s), computes `elapsedSec = timeLimitSec - remaining`, calls `onSubmit` on user submit or on expiry. Commit: `feat(front): timed quiz UI with auto-submit countdown`.

---

### Task B5: Result step + Profile type cards (level badge + expiry countdown + อัปเลเวล)

**Files:**
- Create: `ong-match-front/src/components/partials/CreateType/StepResult.tsx`
- Create: `ong-match-front/src/components/common/TypeCard.tsx`, `.../LevelBadge.tsx`
- Modify: `ong-match-front/src/components/partials/Profile/ProfileContent.tsx` (render my types via `useMyTypes`)

**Interfaces:**
- Consumes: `SubmitQuizResponse`, `MyType`, `useMyTypes`.
- Produces: `<TypeCard type={MyType} onRelevel={id=>...} />` — title, `<LevelBadge level/>` ("lvl 40"), `เหลือ {daysLeft} วัน`, "อัปเลเวล" button (disabled when a cooldown 429 was hit).

- [ ] TDD-light: `LevelBadge` renders "lvl N" and a color band by level; `TypeCard` shows `เหลือ N วัน` and an "หมดอายุ" state when `status==='expired'`. Wire Profile to list real types with mock fallback. Commit: `feat(front): result step + profile type cards with level & expiry`.

---

### Task B6: Chat-app UI rework + end-to-end verify

**Files:**
- Modify: `ong-match-front/src/components/layout/AppShell/AppShellLayout.tsx` (messaging-style nav: bottom tab bar mobile / slim sidebar desktop)
- Modify: `ong-match-front/src/app/globals.css`, `ong-match-front/src/components/providers/UIProvider.tsx` (accent theme, rounded radii, bubble styles)
- Modify: `ong-match-front/src/app/page.tsx` (landing tone → app feel)

**Interfaces:** none new — visual pass only, reusing existing `Base*` components.

- [ ] Apply `frontend-design` principles: cohesive accent, generous radius, motion on key CTAs, message-bubble treatment in chat, remove dashboard/table vibes. Keep Mantine.
- [ ] **End-to-end verify (the real gate):** run backend (`bun run src/index.ts`) + frontend (`npm/bun run dev`), then in the browser: create a type → see AI reject a fake one → pass a quiz with the timer counting down → land on result with a level → open profile and see the level badge + "เหลือ 30 วัน" + press อัปเลเวล. Capture the flow. Commit: `feat(front): chat-app UI rework`.

---

## Self-Review Notes (coverage)

- Spec §3 data model → A2. §4 endpoints → A7 (+ `/tribes` `/interests` left to existing frontend mock; not re-implemented in Phase 1, acceptable per design "kept for backward-compat").
- Spec §5 AI (guardrail/quiz/grade + JSON + fallback) → A4, A5. §6 level/quiz/anti-fake mechanics → A5 (suspectedFake) + A7 (thresholds, cooldown, initial/relevel) + B4 (timer). §7 frontend rework → B3–B6. §8 verification → tests in A1–A7, B4, and B6 e2e.
- Deferred (tags UI, search, match rules, chat backend) intentionally out of Phase 1 — tags ARE stored (A6) for Phase 2.
- Type-name consistency checked: `validateType/generateQuiz/gradeQuiz`, `createType/listMyTypes/setLevel/getType`, `createQuiz/getQuiz/markGraded/lastAttemptAt`, `createApp(chatFn?)` used consistently across tasks.
```
