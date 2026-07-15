import { sign, verify } from "hono/jwt";

const SECRET = process.env.JWT_SECRET;
if (!SECRET) throw new Error("JWT_SECRET is required");

/** Days a login token stays valid. */
const TTL_DAYS = 30;
const ALG = "HS256" as const;

export async function signToken(userId: string): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + TTL_DAYS * 86400;
  return sign({ sub: userId, exp }, SECRET as string, ALG);
}

/** Returns the user id, or null when the token is missing/invalid/expired. */
export async function verifyToken(token: string): Promise<string | null> {
  try {
    const payload = await verify(token, SECRET as string, ALG);
    return typeof payload?.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}
