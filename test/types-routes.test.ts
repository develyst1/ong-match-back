import { describe, it, expect, beforeAll } from "bun:test";
import { migrate } from "../src/db/migrate";
import { createApp } from "../src/app";
import { makeUser } from "./helpers";
import type { ChatMsg } from "../src/ai/client";

let H: Record<string, string>;

beforeAll(async () => {
  await migrate();
  H = (await makeUser(`r${Date.now()}@x.co`)).headers;
});

const okChat = async (msgs: ChatMsg[]) => {
  const sys = msgs[0].content;
  if (sys.includes("ตรวจสอบ"))
    return '{"valid":true,"reason":"ok","normalizedTitle":"ชอบเล่นกีตาร์","tags":["กีตาร์"]}';
  if (sys.includes("แบบทดสอบวัด"))
    return '{"questions":[{"id":"q1","prompt":"a","expected":"x","points":10},{"id":"q2","prompt":"b","expected":"y","points":10},{"id":"q3","prompt":"c","expected":"z","points":10}],"timeLimitSec":60}';
  return '{"score":80,"perQuestion":[],"suspectedFake":false}';
};

describe("types routes", () => {
  it("validate -> submit(pass) yields level>0 and active type", async () => {
    await migrate();
    const app = createApp(okChat);

    const v = await app.request("/api/v1/types/validate", {
      method: "POST",
      headers: H,
      body: JSON.stringify({ title: "กีตาร์", description: "เล่นมา 5 ปี" }),
    });
    expect(v.status).toBe(200);
    const vb = (await v.json()) as any;
    const quizId = vb.data.quiz.id;
    expect(vb.data.quiz.questions.length).toBeGreaterThanOrEqual(3);
    expect(vb.data.quiz.questions[0].expected).toBeUndefined();

    const s = await app.request(`/api/v1/quizzes/${quizId}/submit`, {
      method: "POST",
      headers: H,
      body: JSON.stringify({ answers: ["a", "b", "c"], elapsedSec: 40 }),
    });
    const sb = (await s.json()) as any;
    expect(sb.data.passed).toBe(true);
    expect(sb.data.level).toBeGreaterThan(0);

    const me = await app.request("/api/v1/types/me", { headers: H });
    const mb = (await me.json()) as any;
    expect(mb.data.some((t: { level: number; daysLeft: number }) => t.level > 0 && t.daysLeft > 28)).toBe(true);
  });

  it("validate rejects fake type", async () => {
    const rejectChat = async () => '{"valid":false,"reason":"ไทป์มั่ว","normalizedTitle":"x","tags":[]}';
    const app = createApp(rejectChat);
    const v = await app.request("/api/v1/types/validate", {
      method: "POST",
      headers: H,
      body: JSON.stringify({ title: "asdkjh", description: "zzz" }),
    });
    expect(v.status).toBe(422);
  });
});
