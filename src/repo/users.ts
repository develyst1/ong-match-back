import { sql } from "../db/client";

export interface UserRow {
  id: string;
  email: string;
  display_name: string | null;
  bio: string | null;
  age: number | null;
  location: string | null;
  avatar_url: string | null;
  cover_url: string | null;
  phone: string | null;
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
  avatarUrl?: string;
  coverUrl?: string;
  phone?: string;
  activityLevel?: string;
}

/** Postgres unique-violation error code, thrown when a phone is already taken. */
export const PG_UNIQUE_VIOLATION = "23505";

/**
 * Update the editable profile fields; fields left `undefined` keep their value
 * (coalesce). `avatarUrl`/`coverUrl` may be set to "" to clear the image.
 * Throws a postgres unique-violation (code 23505) if `phone` is already used.
 */
export async function updateUser(userId: string, patch: UpdateUserPatch): Promise<UserRow> {
  const rows = await sql<UserRow[]>`
    update users set
      display_name = coalesce(${patch.displayName ?? null}, display_name),
      bio = coalesce(${patch.bio ?? null}, bio),
      age = coalesce(${patch.age ?? null}, age),
      location = coalesce(${patch.location ?? null}, location),
      avatar_url = coalesce(${patch.avatarUrl ?? null}, avatar_url),
      cover_url = coalesce(${patch.coverUrl ?? null}, cover_url),
      phone = coalesce(${patch.phone ?? null}, phone),
      activity_level = coalesce(${patch.activityLevel ?? null}, activity_level)
    where id = ${userId}
    returning *`;
  return rows[0];
}
