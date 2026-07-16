import { describe, it, expect } from "bun:test";
import { migrate } from "../src/db/migrate";
import { createApp } from "../src/app";

const json = { "Content-Type": "application/json" };
const body = async (r: Response): Promise<any> => (await r.json()) as any;

describe("auth", () => {
  it("register issues a JWT that authorizes protected routes", async () => {
    await migrate();
    const app = createApp();
    const email = `auth${Date.now()}@real.co`;

    const reg = await app.request("/api/v1/auth/register", {
      method: "POST",
      headers: json,
      body: JSON.stringify({ email, password: "secret123", displayName: "เทสต์" }),
    });
    expect(reg.status).toBe(200);
    const token = (await body(reg)).data.token as string;
    expect(token.split(".").length).toBe(3); // looks like a JWT

    // The token authorizes a protected route (no x-user-email needed).
    const me = await app.request("/api/v1/types/me", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(me.status).toBe(200);
  });

  it("rejects duplicate email, wrong password, and unknown user", async () => {
    await migrate();
    const app = createApp();
    const email = `dup${Date.now()}@real.co`;
    const reg = (p: string) =>
      app.request("/api/v1/auth/register", { method: "POST", headers: json, body: JSON.stringify({ email, password: p }) });

    expect((await reg("secret123")).status).toBe(200);
    expect((await reg("secret123")).status).toBe(409); // duplicate email

    const login = (p: string) =>
      app.request("/api/v1/auth/login", { method: "POST", headers: json, body: JSON.stringify({ email, password: p }) });
    expect((await login("secret123")).status).toBe(200); // correct
    expect((await login("wrongpass")).status).toBe(401); // wrong password

    const unknown = await app.request("/api/v1/auth/login", {
      method: "POST", headers: json, body: JSON.stringify({ email: `nope${Date.now()}@real.co`, password: "x" }),
    });
    expect(unknown.status).toBe(401);
  });

  it("blocks protected routes without a valid token", async () => {
    const app = createApp();
    const noAuth = await app.request("/api/v1/types/me");
    expect(noAuth.status).toBe(401);
    const badToken = await app.request("/api/v1/types/me", { headers: { Authorization: "Bearer garbage" } });
    expect(badToken.status).toBe(401);
  });
});
