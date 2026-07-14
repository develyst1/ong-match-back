import { describe, it, expect } from "bun:test";
import { RULES } from "../src/config/rules";
import { validateType } from "../src/ai/types-ai";

describe("levelInBand", () => {
  it("fails below failScore", () => {
    expect(RULES.levelInBand(30, 20, 40)).toBe(0);
  });
  it("maps failScore to estMin", () => {
    expect(RULES.levelInBand(40, 20, 40)).toBe(20);
  });
  it("maps 100 to estMax", () => {
    expect(RULES.levelInBand(100, 20, 40)).toBe(40);
  });
  it("lands inside the band for a mid score", () => {
    const lv = RULES.levelInBand(70, 20, 40);
    expect(lv).toBeGreaterThan(20);
    expect(lv).toBeLessThan(40);
  });
});

describe("validateType estimate", () => {
  const fake = (reply: string) => async () => reply;

  it("parses est band + verdict", async () => {
    const r = await validateType(
      fake('{"valid":true,"reason":"","normalizedTitle":"เล่นกีตาร์","tags":["กีตาร์"],"estMin":40,"estMax":65,"verdict":"รู้ลึกมาก"}'),
      "กีตาร์",
      "story",
    );
    expect(r.estMin).toBe(40);
    expect(r.estMax).toBe(65);
    expect(r.verdict).toBe("รู้ลึกมาก");
  });

  it("widens a too-narrow band and orders min<max", async () => {
    const r = await validateType(
      fake('{"valid":true,"normalizedTitle":"x","tags":[],"estMin":50,"estMax":52}'),
      "x",
      "y",
    );
    expect(r.estMin).toBeLessThan(r.estMax);
    expect(r.estMax - r.estMin).toBeGreaterThanOrEqual(10);
  });
});
