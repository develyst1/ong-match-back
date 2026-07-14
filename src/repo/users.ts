import { sql } from "../db/client";

export interface UserRow {
  id: string;
  email: string;
  display_name: string | null;
  bio: string | null;
  age: number | null;
  location: string | null;
  avatar_url: string | null;
  activity_level: string | null;
  created_at: string;
}

export async function upsertUserByEmail(email: string): Promise<{ id: string; email: string }> {
  const rows = await sql<{ id: string; email: string }[]>`
    insert into users (email) values (${email})
    on conflict (email) do update set email = excluded.email
    returning id, email`;
  return rows[0];
}

export async function getUserById(userId: string): Promise<UserRow | null> {
  const rows = await sql<UserRow[]>`select * from users where id = ${userId}`;
  return rows[0] ?? null;
}

export interface UpdateUserPatch {
  displayName?: string;
  bio?: string;
  age?: number;
  location?: string;
  activityLevel?: string;
}

/** Update the editable profile fields; unspecified fields keep their value (coalesce). */
export async function updateUser(userId: string, patch: UpdateUserPatch): Promise<UserRow> {
  const rows = await sql<UserRow[]>`
    update users set
      display_name = coalesce(${patch.displayName ?? null}, display_name),
      bio = coalesce(${patch.bio ?? null}, bio),
      age = coalesce(${patch.age ?? null}, age),
      location = coalesce(${patch.location ?? null}, location),
      activity_level = coalesce(${patch.activityLevel ?? null}, activity_level)
    where id = ${userId}
    returning *`;
  return rows[0];
}
