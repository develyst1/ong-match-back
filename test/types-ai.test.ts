import { describe, it, expect } from "bun:test";
import { validateType, generateQuiz, gradeQuiz } from "../src/ai/types-ai";

const fake = (reply: string) => async () => reply;

describe("types-ai", () => {
  it("validateType parses a valid verdict", async () => {
    const r = await validateType(
      fake('{"valid":true,"reason":"ok","normalizedTitle":"ชอบเล่นกีตาร์","tags":["กีตาร์","ดนตรี"]}'),
      "กีตาร์",
      "เล่นมา 5 ปี",
    );
    expect(r.valid).toBe(true);
    expect(r.tags).toContain("ดนตรี");
  });

  it("validateType falls back to reject on bad JSON", async () => {
    const r = await validateType(fake("พังไม่เป็น json"), "x", "y");
    expect(r.valid).toBe(false);
  });

  it("generateQuiz enforces >=3 questions (pads if fewer)", async () => {
    const r = await generateQuiz(
      fake('{"questions":[{"id":"q1","prompt":"a","expected":"x","points":10}],"timeLimitSec":60}'),
      "กีตาร์",
      "desc",
      "beginner",
    );
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
