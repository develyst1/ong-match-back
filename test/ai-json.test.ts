import { describe, it, expect } from "bun:test";
import { extractJson } from "../src/ai/json";

describe("extractJson", () => {
  it("parses fenced json with surrounding prose", () => {
    const s = 'นี่คือผลลัพธ์:\n```json\n{"valid": true, "tags": ["a","b"]}\n```\nจบ';
    expect(extractJson(s)).toEqual({ valid: true, tags: ["a", "b"] });
  });

  it("parses bare json", () => {
    expect(extractJson('{"score":80}')).toEqual({ score: 80 });
  });

  it("handles braces inside strings", () => {
    expect(extractJson('{"note":"a } b { c"}')).toEqual({ note: "a } b { c" });
  });

  it("throws on no json", () => {
    expect(() => extractJson("ไม่มี json")).toThrow();
  });
});
