/** Central tunables for the type/quiz/level/expiry system. */
export const RULES = {
  minQuestions: 3,
  secPerQuestion: 20,
  passScore: 60,
  cooldownHours: 24,
  expiryDays: 30,
  /** Below this score the quiz is a fail (no level granted). */
  failScore: 40,
  /**
   * Map a quiz score to a level inside the AI-estimated band [estMin, estMax].
   * score=failScore → estMin, score=100 → estMax. Below failScore → 0 (fail).
   */
  levelInBand: (score: number, estMin: number, estMax: number) => {
    if (score < 40) return 0;
    const t = Math.max(0, Math.min(1, (score - 40) / 60));
    return Math.round(estMin + (estMax - estMin) * t);
  },
} as const;
