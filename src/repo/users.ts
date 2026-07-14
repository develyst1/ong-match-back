import { sql } from "../db/client";

export async function upsertUserByEmail(email: string): Promise<{ id: string; email: string }> {
  const rows = await sql<{ id: string; email: string }[]>`
    insert into users (email) values (${email})
    on conflict (email) do update set email = excluded.email
    returning id, email`;
  return rows[0];
}
