import { Hono } from "hono";
import { z } from "zod";
import { signToken } from "../auth/jwt";
import { getAuthByEmail, createUserWithPassword, PG_UNIQUE_VIOLATION } from "../repo/users";

/** Real email+password auth (Bun.password hashing + JWT). Public — no middleware. */
export function authRoutes() {
  const r = new Hono();

  r.post("/auth/register", async (c) => {
    const { email, password, displayName } = z
      .object({
        email: z.string().email(),
        password: z.string().min(6, "รหัสผ่านอย่างน้อย 6 ตัว"),
        displayName: z.string().optional(),
      })
      .parse(await c.req.json());

    if (await getAuthByEmail(email)) {
      return c.json({ success: false, error: "อีเมลนี้ถูกใช้แล้ว" }, 409);
    }
    const hash = await Bun.password.hash(password);
    try {
      const u = await createUserWithPassword(email, hash, displayName ?? null);
      const token = await signToken(u.id, u.email);
      return c.json({ success: true, data: { token, user: { id: u.id, email: u.email } } });
    } catch (e) {
      // Race on the unique email index.
      if ((e as { code?: string })?.code === PG_UNIQUE_VIOLATION) {
        return c.json({ success: false, error: "อีเมลนี้ถูกใช้แล้ว" }, 409);
      }
      throw e;
    }
  });

  r.post("/auth/login", async (c) => {
    const { email, password } = z
      .object({ email: z.string().email(), password: z.string() })
      .parse(await c.req.json());

    const u = await getAuthByEmail(email);
    const ok = !!u?.password_hash && (await Bun.password.verify(password, u.password_hash));
    if (!u || !ok) {
      return c.json({ success: false, error: "อีเมลหรือรหัสผ่านไม่ถูกต้อง" }, 401);
    }
    const token = await signToken(u.id, u.email);
    return c.json({ success: true, data: { token, user: { id: u.id, email: u.email } } });
  });

  return r;
}
