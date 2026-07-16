import { Hono } from "hono";
import { z } from "zod";
import { createUser, getUserByEmail, PG_UNIQUE_VIOLATION, type UserRow } from "../repo/users";
import { signToken } from "../auth/token";

/** Public account shape returned alongside a token (never includes the hash). */
function toAuthUser(u: UserRow) {
  return {
    id: u.id,
    email: u.email,
    displayName: u.display_name ?? u.email.split("@")[0],
    avatarUrl: u.avatar_url ?? "",
  };
}

/**
 * Public auth endpoints. These are the ONLY way an account comes into
 * existence — every other route requires a verified token.
 */
export function authRoutes() {
  const r = new Hono();

  r.post("/auth/register", async (c) => {
    const body = z
      .object({
        email: z.string().email(),
        password: z.string().min(8, "รหัสผ่านต้องยาวอย่างน้อย 8 ตัว"),
        displayName: z.string().min(1).optional(),
        phone: z.string().regex(/^0\d{8,9}$/, "เบอร์โทรไม่ถูกต้อง").optional(),
        age: z.number().int().min(1).max(120).optional(),
      })
      .parse(await c.req.json());

    const passwordHash = await Bun.password.hash(body.password);
    try {
      const user = await createUser({ ...body, passwordHash });
      return c.json({ success: true, data: { token: await signToken(user.id), user: toAuthUser(user) } }, 201);
    } catch (e) {
      if ((e as { code?: string })?.code === PG_UNIQUE_VIOLATION) {
        const msg = String((e as { detail?: string })?.detail ?? "").includes("phone")
          ? "เบอร์นี้ถูกใช้สมัครแล้ว"
          : "อีเมลนี้ถูกใช้สมัครแล้ว";
        return c.json({ success: false, error: msg }, 409);
      }
      throw e;
    }
  });

  r.post("/auth/login", async (c) => {
    const body = z
      .object({ email: z.string().min(1), password: z.string().min(1) })
      .parse(await c.req.json());

    const user = await getUserByEmail(body.email);
    // Same generic message whether the account is missing, has no password, or
    // the password is wrong — don't leak which emails are registered.
    const invalid = () => c.json({ success: false, error: "อีเมลหรือรหัสผ่านไม่ถูกต้อง" }, 401);
    if (!user?.password_hash) return invalid();

    let ok = false;
    try {
      ok = await Bun.password.verify(body.password, user.password_hash);
    } catch {
      ok = false; // malformed/legacy hash — treat as a failed login
    }
    if (!ok) return invalid();

    return c.json({ success: true, data: { token: await signToken(user.id), user: toAuthUser(user) } });
  });

  return r;
}
