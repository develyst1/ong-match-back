import { describe, it, expect } from "bun:test";
import { migrate } from "../src/db/migrate";
import { createApp } from "../src/app";
import { getUserByEmail } from "../src/repo/users";

const json = { "Content-Type": "application/json" };
const body = (r: Response) => r.json() as Promise<any>;

describe("auth", () => {
  it("registers an account, then logs in only with the correct password", async () => {
    await migrate();
    const app = createApp();
    const email = `auth${Date.now()}@x.co`;
    const password = "correct-horse";

    const reg = await app.request("/api/v1/auth/register", {
      method: "POST",
      headers: json,
      body: JSON.stringify({ email, password, displayName: "เทส" }),
    });
    expect(reg.status).toBe(201);
    expect((await body(reg)).data.token).toBeTruthy();

    // The password is stored hashed, never in the clear.
    const stored = await getUserByEmail(email);
    expect(stored?.password_hash).toBeTruthy();
    expect(stored?.password_hash).not.toBe(password);

    const ok = await app.request("/api/v1/auth/login", {
      method: "POST",
      headers: json,
      body: JSON.stringify({ email, password }),
    });
    expect(ok.status).toBe(200);
    expect((await body(ok)).data.token).toBeTruthy();

    // The bug this fixes: a wrong password used to log in fine.
    const wrong = await app.request("/api/v1/auth/login", {
      method: "POST",
      headers: json,
      body: JSON.stringify({ email, password: "totally-wrong" }),
    });
    expect(wrong.status).toBe(401);
  });

  it("rejects login for an email that was never registered — and creates nothing", async () => {
    await migrate();
    const app = createApp();
    const email = `ghost${Date.now()}@x.co`;

    const res = await app.request("/api/v1/auth/login", {
      method: "POST",
      headers: json,
      body: JSON.stringify({ email, password: "anything" }),
    });
    expect(res.status).toBe(401);
    // No implicit account was conjured up for the unknown email.
    expect(await getUserByEmail(email)).toBeNull();
  });

  it("refuses a duplicate email registration", async () => {
    await migrate();
    const app = createApp();
    const email = `dupreg${Date.now()}@x.co`;
    const payload = JSON.stringify({ email, password: "password123" });

    expect((await app.request("/api/v1/auth/register", { method: "POST", headers: json, body: payload })).status).toBe(201);
    const again = await app.request("/api/v1/auth/register", { method: "POST", headers: json, body: payload });
    expect(again.status).toBe(409);
  });

  it("blocks protected routes without a valid token, and cannot be spoofed by header", async () => {
    await migrate();
    const app = createApp();

    // No token at all.
    expect((await app.request("/api/v1/types/me")).status).toBe(401);

    // A forged/garbage bearer token.
    expect(
      (await app.request("/api/v1/types/me", { headers: { Authorization: "Bearer not-a-real-token" } })).status,
    ).toBe(401);

    // The old impersonation hole: picking an identity via header no longer works.
    expect(
      (await app.request("/api/v1/types/me", { headers: { "x-user-email": "victim@x.co" } })).status,
    ).toBe(401);
  });

  it("accepts the token issued at registration on protected routes", async () => {
    await migrate();
    const app = createApp();
    const reg = await app.request("/api/v1/auth/register", {
      method: "POST",
      headers: json,
      body: JSON.stringify({ email: `tok${Date.now()}@x.co`, password: "password123" }),
    });
    const token = (await body(reg)).data.token as string;

    const me = await app.request("/api/v1/users/me", { headers: { Authorization: `Bearer ${token}` } });
    expect(me.status).toBe(200);
  });
});
