import { extractJson } from "./json";
import { GUARDRAIL_SYS, SUGGEST_SYS, QUIZGEN_SYS, GRADE_SYS } from "./prompts";
import type { ChatMsg } from "./client";

export interface TypeCandidate {
  title: string;
  blurb: string;
  tags: string[];
}

export interface QuizQuestion {
  id: string;
  prompt: string;
  choices?: string[];
  expected: string;
  points: number;
}

export type ChatFn = (messages: ChatMsg[]) => Promise<string>;

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, Math.round(n)));

export async function validateType(chatFn: ChatFn, title: string, description: string) {
  try {
    const out = await chatFn([
      { role: "system", content: GUARDRAIL_SYS },
      { role: "user", content: `title: ${title}\ndescription: ${description}` },
    ]);
    const j = extractJson<{
      valid?: boolean; reason?: string; normalizedTitle?: string; tags?: unknown[];
      estMin?: number; estMax?: number; verdict?: string;
    }>(out);
    // Normalize the estimated band: clamp, order, and keep a sane minimum width.
    let estMin = clamp(Number(j.estMin) || 10, 1, 100);
    let estMax = clamp(Number(j.estMax) || 35, 1, 100);
    if (estMin > estMax) [estMin, estMax] = [estMax, estMin];
    if (estMax - estMin < 10) estMax = clamp(estMin + 15, 1, 100);
    return {
      valid: !!j.valid,
      reason: String(j.reason ?? ""),
      normalizedTitle: String(j.normalizedTitle ?? title),
      tags: Array.isArray(j.tags) ? j.tags.map(String).slice(0, 8) : [],
      estMin,
      estMax,
      verdict: String(j.verdict ?? "ดูน่าสนใจ ลองทำแบบทดสอบกัน"),
    };
  } catch {
    return {
      valid: false,
      reason: "ระบบตรวจไทป์ไม่สำเร็จ ลองใหม่อีกครั้ง",
      normalizedTitle: title,
      tags: [] as string[],
      estMin: 10,
      estMax: 35,
      verdict: "",
    };
  }
}

/** Story → 2-3 candidate types for the user to pick from (no naming by hand). */
export async function suggestTypes(chatFn: ChatFn, story: string): Promise<TypeCandidate[]> {
  try {
    const out = await chatFn([
      { role: "system", content: SUGGEST_SYS },
      { role: "user", content: story },
    ]);
    const j = extractJson<{ candidates?: TypeCandidate[] }>(out);
    const list = Array.isArray(j.candidates) ? j.candidates : [];
    return list
      .filter((c) => c && typeof c.title === "string" && c.title.trim())
      .slice(0, 3)
      .map((c) => ({
        title: String(c.title).trim(),
        blurb: String(c.blurb ?? "").trim(),
        tags: Array.isArray(c.tags) ? c.tags.map(String).slice(0, 6) : [],
      }));
  } catch {
    return [];
  }
}

export async function generateQuiz(chatFn: ChatFn, title: string, description: string, band: string) {
  try {
    const out = await chatFn([
      { role: "system", content: QUIZGEN_SYS },
      { role: "user", content: `title: ${title}\ndescription: ${description}\nระดับ: ${band}` },
    ]);
    const j = extractJson<{ questions?: QuizQuestion[]; timeLimitSec?: number }>(out);
    const questions: QuizQuestion[] = Array.isArray(j.questions) ? j.questions : [];
    while (questions.length < 3) {
      const n = questions.length + 1;
      questions.push({ id: `q${n}`, prompt: `เล่าประสบการณ์ของคุณเกี่ยวกับ ${title} (ข้อ ${n})`, expected: "", points: 10 });
    }
    return { questions, timeLimitSec: Number(j.timeLimitSec) || questions.length * 20 };
  } catch {
    const questions: QuizQuestion[] = [1, 2, 3].map((n) => ({
      id: `q${n}`,
      prompt: `เล่าเกี่ยวกับ ${title} เชิงลึก (ข้อ ${n})`,
      expected: "",
      points: 10,
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
    const j = extractJson<{ score?: number; perQuestion?: unknown[]; suspectedFake?: boolean }>(out);
    return {
      score: clamp(Number(j.score) || 0),
      perQuestion: Array.isArray(j.perQuestion) ? (j.perQuestion as { id: string; correct: boolean; note: string }[]) : [],
      suspectedFake: !!j.suspectedFake,
    };
  } catch {
    return { score: 0, perQuestion: [] as { id: string; correct: boolean; note: string }[], suspectedFake: false };
  }
}
