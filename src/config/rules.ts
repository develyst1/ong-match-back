/** Central tunables for the type/quiz/level/expiry system. */
export const RULES = {
  minQuestions: 3,
  secPerQuestion: 20,
  passScore: 60,
  cooldownHours: 24,
  expiryDays: 30,
  /** First-pass level from a 0..100 score (up to ~40). */
  initialLevel: (score: number) => Math.round(score * 0.4),
  /** Extra levels granted on a re-level pass. */
  relevelDelta: (score: number) => Math.round((score - 50) * 0.3),
} as const;
