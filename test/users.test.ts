import { describe, it, expect } from "bun:test";
import { upsertUserByEmail } from "../src/repo/users";
import { migrate } from "../src/db/migrate";

describe("users", () => {
  it("upsert is idempotent by email", async () => {
    await migrate();
    const email = `u${Date.now()}@x.co`;
    const a = await upsertUserByEmail(email);
    const b = await upsertUserByEmail(email);
    expect(a.id).toBe(b.id);
    expect(a.email).toBe(email);
  });
});
