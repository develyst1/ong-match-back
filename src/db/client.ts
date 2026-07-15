import postgres from "postgres";

/** Append `_test` to the database name in a connection URL. */
function toTestUrl(base: string): string {
  return base.replace(/\/([^/?]+)(\?|$)/, (_m, db: string, tail: string) => `/${db}_test${tail}`);
}

const base = process.env.DATABASE_URL;
if (!base) throw new Error("DATABASE_URL is required");

// Under `bun test` (NODE_ENV=test) use a separate DB so integration tests never
// pollute prod data. Uses TEST_DATABASE_URL if set, otherwise `<db>_test`.
const isTest = process.env.NODE_ENV === "test";
const url = isTest ? (process.env.TEST_DATABASE_URL ?? toTestUrl(base)) : base;

export const sql = postgres(url, { max: 5, idle_timeout: 20, onnotice: () => {} });
