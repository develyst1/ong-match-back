import { sign, verify } from "hono/jwt";

// Set JWT_SECRET in production. The dev fallback is intentionally obvious so a
// missing secret is caught in review rather than silently shipping.
const SECRET = process.env.JWT_SECRET ?? "dev-insecure-secret-change-me";
const TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

export interface AuthPayload {
  sub: string; // user id
  email: string;
  exp: number;
  iat: number;
}

export async function signToken(userId: string, email: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return sign({ sub: userId, email, iat: now, exp: now + TTL_SECONDS }, SECRET, "HS256");
}

export async function verifyToken(token: string): Promise<AuthPayload | null> {
  try {
    return (await verify(token, SECRET, "HS256")) as unknown as AuthPayload;
  } catch {
    return null;
  }
}
