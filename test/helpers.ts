import { createUser } from "../src/repo/users";
import { signToken } from "../src/auth/token";

export interface TestUser {
  id: string;
  email: string;
  /** Ready-to-use headers with a real signed Bearer token. */
  headers: Record<string, string>;
}

/** Create a real account (as /auth/register would) and sign it a valid token. */
export async function makeUser(email: string, password = "test-password"): Promise<TestUser> {
  const user = await createUser({ email, passwordHash: await Bun.password.hash(password) });
  const token = await signToken(user.id);
  return {
    id: user.id,
    email: user.email,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
  };
}
