import { Hono } from "hono";
import { z } from "zod";
import { userMiddleware } from "../middleware/user";
import { validateType, suggestTypes, generateQuiz, gradeQuiz } from "../ai/types-ai";
import type { QuizQuestion } from "../ai/types-ai";
import { createType, getType, setLevel, listMyTypes, setMinContactLevel } from "../repo/types";
import { createQuiz, getQuiz, markGraded, lastAttemptAt } from "../repo/quizzes";
import { RULES } from "../config/rules";
import type { ChatMsg } from "../ai/client";

type ChatFn = (m: ChatMsg[]) => Promise<string>;

/** Remove the answer key before sending a quiz to the client. */
const stripAnswers = (qs: QuizQuestion[]) =>
  qs.map(({ expected, ...rest }) => rest);

export function typesRoutes(chatFn: ChatFn) {
  const r = new Hono<{ Variables: { userId: string } }>();
  r.use("*", userMiddleware);

  // Story-first creation: the user tells a story, AI proposes 2-3 type names
  // to pick from (the user no longer names the type by hand).
  r.post("/types/suggest", async (c) => {
    const body = z.object({ story: z.string().min(10) }).parse(await c.req.json());
    const candidates = await suggestTypes(chatFn, body.story);
    if (candidates.length === 0) {
      return c.json({ success: false, error: "AI แนะนำไทป์ไม่สำเร็จ ลองเล่าให้ละเอียดขึ้น" }, 422);
    }
    return c.json({ success: true, data: { candidates } });
  });

  r.post("/types/validate", async (c) => {
    const body = z
      .object({ title: z.string().min(1), description: z.string().default("") })
      .parse(await c.req.json());
    const verdict = await validateType(chatFn, body.title, body.description);
    if (!verdict.valid) return c.json({ success: false, error: verdict.reason }, 422);

    const userId = c.get("userId");
    const type = await createType(userId, verdict.normalizedTitle, body.description, verdict.tags);
    const quiz = await generateQuiz(chatFn, verdict.normalizedTitle, body.description, `${verdict.estMin}-${verdict.estMax}`);
    const saved = await createQuiz(type.id, userId, quiz.questions, quiz.timeLimitSec, 1, verdict.estMin, verdict.estMax);
    return c.json({
      success: true,
      data: {
        type,
        // verdict is the qualitative blurb; the numeric band stays hidden from the client.
        verdict: verdict.verdict,
        quiz: { id: saved.id, questions: stripAnswers(quiz.questions), timeLimitSec: quiz.timeLimitSec },
      },
    });
  });

  r.post("/quizzes/:id/submit", async (c) => {
    const id = c.req.param("id");
    const body = z
      .object({ answers: z.array(z.any()), elapsedSec: z.number() })
      .parse(await c.req.json());
    const quiz = await getQuiz(id);
    if (!quiz) return c.json({ success: false, error: "quiz not found" }, 404);

    const graded = await gradeQuiz(chatFn, quiz.questions, body.answers, body.elapsedSec);
    // Level lands inside the AI-estimated band; below failScore (or faked) → fail.
    const banded = RULES.levelInBand(graded.score, quiz.est_min, quiz.est_max);
    const passed = banded > 0 && !graded.suspectedFake;
    await markGraded(id, passed ? "passed" : "failed", graded.score);

    let level = 0;
    if (passed) {
      const t = await getType(quiz.type_id);
      // Re-level never lowers an existing level; take the higher of current vs banded.
      level = quiz.attempt_no === 1 ? banded : Math.min(100, Math.max(t?.level ?? 0, banded));
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
    // Re-level aims one band above the current level.
    const estMin = Math.min(100, type.level + 5);
    const estMax = Math.min(100, type.level + 25);
    const quiz = await generateQuiz(chatFn, type.title, type.description ?? "", `level ${type.level}+ (${estMin}-${estMax})`);
    const saved = await createQuiz(typeId, userId, quiz.questions, quiz.timeLimitSec, 2, estMin, estMax);
    return c.json({
      success: true,
      data: { quiz: { id: saved.id, questions: stripAnswers(quiz.questions), timeLimitSec: quiz.timeLimitSec } },
    });
  });

  r.get("/types/me", async (c) => {
    const list = await listMyTypes(c.get("userId"));
    return c.json({ success: true, data: list });
  });

  // Chat policy: set the minimum sender level required to chat about this type.
  r.put("/types/:id/requirement", async (c) => {
    const body = z.object({ minLevel: z.number().int().min(0).max(100) }).parse(await c.req.json());
    const ok = await setMinContactLevel(c.req.param("id"), c.get("userId"), body.minLevel);
    if (!ok) return c.json({ success: false, error: "type not found" }, 404);
    return c.json({ success: true, data: { minContactLevel: body.minLevel } });
  });

  return r;
}
