import type { Context, Next } from "hono";
import { upsertUserByEmail } from "../repo/users";

/** Reads x-user-email, upserts the user, and stashes userId on the context. */
export async function userMiddleware(c: Context, next: Next) {
  const email = c.req.header("x-user-email");
  if (!email) return c.json({ success: false, error: "missing x-user-email" }, 401);
  const u = await upsertUserByEmail(email);
  c.set("userId", u.id);
  await next();
}
