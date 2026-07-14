import { describe, it, expect } from "bun:test";
import { migrate } from "../src/db/migrate";
import { sql } from "../src/db/client";

describe("db", () => {
  it("migrate creates tables", async () => {
    await migrate();
    const rows = await sql`
      select table_name from information_schema.tables
      where table_name in ('users','types','quizzes','type_tags')`;
    expect(rows.length).toBe(4);
  });
});
