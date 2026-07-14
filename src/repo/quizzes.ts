import { sql } from "../db/client";
import type { QuizQuestion } from "../ai/types-ai";

export interface QuizRow {
  id: string;
  type_id: string;
  user_id: string;
  questions: QuizQuestion[];
  status: string;
  score: number | null;
  time_limit_sec: number;
  attempt_no: number;
  started_at: string | null;
  submitted_at: string | null;
}

export async function createQuiz(
  typeId: string,
  userId: string,
  questions: QuizQuestion[],
  timeLimitSec: number,
  attemptNo: number,
): Promise<QuizRow> {
  const rows = await sql<QuizRow[]>`
    insert into quizzes (type_id, user_id, questions, time_limit_sec, attempt_no, started_at)
    values (${typeId}, ${userId}, ${sql.json(questions as unknown as object)}, ${timeLimitSec}, ${attemptNo}, now())
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
