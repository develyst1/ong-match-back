import { sql } from "../db/client";

export interface TypeSearchItem {
  id: string;
  title: string;
  level: number;
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  tags: string[];
}

export interface MatchingPerson {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  type_title: string;
  type_level: number;
  my_level: number;
  level_gap: number;
  shared_tags: number;
}

export interface PublicProfile {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  location: string | null;
  types: { id: string; title: string; level: number; daysLeft: number; status: string }[];
}

/** Search active types by title substring and/or tag list (any-match). */
export async function searchTypes(q: string, tags: string[]): Promise<TypeSearchItem[]> {
  const rows = await sql<(Omit<TypeSearchItem, "tags"> & { tags: string[] | null })[]>`
    select t.id, t.title, t.level, u.id as user_id, u.display_name, u.avatar_url,
           array_remove(array_agg(distinct tt.tag), null) as tags
    from types t
    join users u on u.id = t.user_id
    left join type_tags tt on tt.type_id = t.id
    where t.expires_at > now()
      and (${q} = '' or t.title ilike ${"%" + q + "%"})
      and (
        cardinality(${tags}::text[]) = 0
        or exists (select 1 from type_tags x where x.type_id = t.id and x.tag = any(${tags}::text[]))
      )
    group by t.id, u.id
    order by t.level desc
    limit 40`;
  return rows.map((r) => ({ ...r, tags: r.tags ?? [] }));
}

/**
 * People (not me) whose types share a tag with mine, ranked by how close their
 * level is to my matching type's level — closest first.
 */
export async function matchingPeople(userId: string): Promise<MatchingPerson[]> {
  return sql<MatchingPerson[]>`
    with my as (
      select tt.tag, t.level as my_level
      from types t join type_tags tt on tt.type_id = t.id
      where t.user_id = ${userId} and t.expires_at > now()
    )
    select u.id as user_id, u.display_name, u.avatar_url, u.bio,
           t.title as type_title, t.level as type_level,
           max(my.my_level) as my_level,
           min(abs(t.level - my.my_level)) as level_gap,
           count(distinct my.tag) as shared_tags
    from types t
    join type_tags tt on tt.type_id = t.id
    join my on my.tag = tt.tag
    join users u on u.id = t.user_id
    where t.user_id <> ${userId} and t.expires_at > now()
    group by u.id, t.id, t.title, t.level
    order by level_gap asc, shared_tags desc, t.level desc
    limit 20`;
}

export async function getPublicProfile(userId: string): Promise<PublicProfile | null> {
  const users = await sql<{ id: string; display_name: string | null; avatar_url: string | null; bio: string | null; location: string | null }[]>`
    select id, display_name, avatar_url, bio, location from users where id = ${userId}`;
  if (!users[0]) return null;
  const types = await sql<{ id: string; title: string; level: number; days_left: number; expires_at: string }[]>`
    select id, title, level, expires_at,
           greatest(0, ceil(extract(epoch from (expires_at - now())) / 86400))::int as days_left
    from types where user_id = ${userId} order by level desc`;
  return {
    ...users[0],
    types: types.map((t) => ({
      id: t.id,
      title: t.title,
      level: t.level,
      daysLeft: t.days_left,
      status: new Date(t.expires_at) < new Date() ? "expired" : "active",
    })),
  };
}
