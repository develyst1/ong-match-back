import { Hono } from "hono";
import { z } from "zod";
import { userMiddleware } from "../middleware/user";
import { validateType, generateQuiz, gradeQuiz } from "../ai/types-ai";
import type { QuizQuestion } from "../ai/types-ai";
import { createType, getType, setLevel, listMyTypes } from "../repo/types";
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

  r.post("/types/validate", async (c) => {
    const body = z
      .object({ title: z.string().min(1), description: z.string().default("") })
      .parse(await c.req.json());
    const verdict = await validateType(chatFn, body.title, body.description);
    if (!verdict.valid) return c.json({ success: false, error: verdict.reason }, 422);

    const userId = c.get("userId");
    const type = await createType(userId, verdict.normalizedTitle, body.description, verdict.tags);
    const quiz = await generateQuiz(chatFn, verdict.normalizedTitle, body.description, "beginner");
    const saved = await createQuiz(type.id, userId, quiz.questions, quiz.timeLimitSec, 1);
    return c.json({
      success: true,
      data: {
        type,
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
    const passed = graded.score >= RULES.passScore && !graded.suspectedFake;
    await markGraded(id, passed ? "passed" : "failed", graded.score);

    let level = 0;
    if (passed) {
      const t = await getType(quiz.type_id);
      level =
        quiz.attempt_no === 1
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
    const quiz = await generateQuiz(chatFn, type.title, type.description ?? "", `level ${type.level}+`);
    const saved = await createQuiz(typeId, userId, quiz.questions, quiz.timeLimitSec, 2);
    return c.json({
      success: true,
      data: { quiz: { id: saved.id, questions: stripAnswers(quiz.questions), timeLimitSec: quiz.timeLimitSec } },
    });
  });

  r.get("/types/me", async (c) => {
    const list = await listMyTypes(c.get("userId"));
    return c.json({ success: true, data: list });
  });

  return r;
}
