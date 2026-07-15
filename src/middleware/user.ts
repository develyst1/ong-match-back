import type { Context, Next } from "hono";
import { verifyToken } from "../auth/token";
import { getUserById } from "../repo/users";

/**
 * Authenticates the caller from `Authorization: Bearer <jwt>` and stashes the
 * user id on the context.
 *
 * The token is signed by the server at login, so the caller cannot pick who
 * they are (the old `x-user-email` header let anyone impersonate anyone and
 * silently created an account for any address). Accounts are never created
 * here — only `/auth/register` does that.
 */
export async function userMiddleware(c: Context, next: Next) {
  const unauthorized = () => c.json({ success: false, error: "unauthorized" }, 401);

  const header = c.req.header("Authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) return unauthorized();

  const userId = await verifyToken(token);
  if (!userId) return unauthorized();

  // The account must still exist (e.g. deleted since the token was issued).
  const user = await getUserById(userId);
  if (!user) return unauthorized();

  c.set("userId", user.id);
  await next();
}
