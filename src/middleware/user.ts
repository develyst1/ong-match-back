import type { Context, Next } from "hono";
import { verifyToken } from "../auth/jwt";
import { upsertUserByEmail } from "../repo/users";

/**
 * Authenticates via a JWT `Authorization: Bearer <token>` and stashes the
 * verified userId on the context. The old spoofable `x-user-email` header is NO
 * LONGER trusted in production — it only works under `bun test` (NODE_ENV=test)
 * as a convenience, and that gate can't be flipped by a request.
 */
export async function userMiddleware(c: Context, next: Next) {
  const auth = c.req.header("Authorization");
  const token = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
  const payload = token ? await verifyToken(token) : null;
  if (payload?.sub) {
    c.set("userId", payload.sub);
    return next();
  }

  // Test-only fallback: signing a JWT per request would bloat every test. This
  // branch is dead in production (NODE_ENV is never "test" there).
  if (process.env.NODE_ENV === "test") {
    const email = c.req.header("x-user-email");
    if (email) {
      const u = await upsertUserByEmail(email);
      c.set("userId", u.id);
      return next();
    }
  }

  return c.json({ success: false, error: "unauthorized" }, 401);
}
