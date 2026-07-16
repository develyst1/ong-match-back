import { describe, it, expect } from "bun:test";
import { createUser, getUserByEmail, PG_UNIQUE_VIOLATION } from "../src/repo/users";
import { migrate } from "../src/db/migrate";

describe("users repo", () => {
  it("creates an account and finds it by email (case-insensitive)", async () => {
    await migrate();
    const email = `u${Date.now()}@x.co`;
    const created = await createUser({ email, passwordHash: "hash" });
    const found = await getUserByEmail(email.toUpperCase());
    expect(found?.id).toBe(created.id);
    expect(found?.email).toBe(email);
  });

  it("refuses a duplicate email — no implicit account creation", async () => {
    await migrate();
    const email = `dup${Date.now()}@x.co`;
    await createUser({ email, passwordHash: "hash" });
    let code: string | undefined;
    try {
      await createUser({ email, passwordHash: "hash" });
    } catch (e) {
      code = (e as { code?: string }).code;
    }
    expect(code).toBe(PG_UNIQUE_VIOLATION);
  });

  it("returns null for an unknown email", async () => {
    await migrate();
    expect(await getUserByEmail(`nobody${Date.now()}@x.co`)).toBeNull();
  });
});
