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

export interface TrendingTag {
  tag: string;
  people: number;
  types: number;
  sample_titles: string[];
}

/**
 * Trending tag-groups: cluster active types by tag and rank by how many distinct
 * people use each tag (e.g. "กีตาร์" spanning ชอบเล่นกีตาร์ / กีตาร์ไฟฟ้า / กีตาร์โปร่ง).
 */
export async function trendingTags(limit = 12): Promise<TrendingTag[]> {
  const rows = await sql<(Omit<TrendingTag, "sample_titles"> & { sample_titles: string[] | null })[]>`
    select tt.tag,
           count(distinct t.user_id)::int as people,
           count(distinct t.id)::int as types,
           (array_agg(distinct t.title))[1:3] as sample_titles
    from type_tags tt
    join types t on t.id = tt.type_id
    where t.expires_at > now()
    group by tt.tag
    order by people desc, types desc, tt.tag asc
    limit ${limit}`;
  return rows.map((r) => ({ ...r, sample_titles: r.sample_titles ?? [] }));
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

export interface ContactCheck {
  allowed: boolean;
  reason: string;
  typeTitle?: string;
  requiredLevel?: number;
  yourLevel?: number;
}

/**
 * Can `callerId` start a chat with `targetId`? Yes if there is a target type
 * whose tags overlap one of the caller's types AND the caller's level in that
 * shared-tag type meets the target type's `min_contact_level`. When blocked,
 * returns the closest gate (smallest level shortfall) for a helpful message.
 */
export async function canContact(callerId: string, targetId: string): Promise<ContactCheck> {
  if (callerId === targetId) return { allowed: true, reason: "นี่คือโปรไฟล์ของคุณเอง" };

  const targetTypes = await sql<{ title: string; min: number; tags: string[] }[]>`
    select t.title, t.min_contact_level as min,
           coalesce(array_agg(distinct tt.tag) filter (where tt.tag is not null), '{}') as tags
    from types t left join type_tags tt on tt.type_id = t.id
    where t.user_id = ${targetId} and t.expires_at > now()
    group by t.id`;
  if (targetTypes.length === 0) return { allowed: false, reason: "ผู้ใช้นี้ยังไม่มีไทป์ให้เริ่มคุย" };

  const callerTypes = await sql<{ level: number; tags: string[] }[]>`
    select t.level, coalesce(array_agg(distinct tt.tag) filter (where tt.tag is not null), '{}') as tags
    from types t left join type_tags tt on tt.type_id = t.id
    where t.user_id = ${callerId} and t.expires_at > now()
    group by t.id`;

  let closestGate: ContactCheck | null = null;
  for (const tt of targetTypes) {
    const sharing = callerTypes.filter((ct) => ct.tags.some((tag) => tt.tags.includes(tag)));
    if (sharing.length === 0) continue;
    const yourLevel = Math.max(...sharing.map((s) => s.level));
    if (yourLevel >= tt.min) {
      return {
        allowed: true,
        reason: `คุณผ่านเกณฑ์ไทป์ "${tt.title}"`,
        typeTitle: tt.title,
        requiredLevel: tt.min,
        yourLevel,
      };
    }
    const gap = tt.min - yourLevel;
    const prevGap = closestGate ? closestGate.requiredLevel! - closestGate.yourLevel! : Infinity;
    if (gap < prevGap) {
      closestGate = {
        allowed: false,
        reason: `ต้องมีเลเวลไทป์ "${tt.title}" อย่างน้อย ${tt.min} (คุณมี ${yourLevel})`,
        typeTitle: tt.title,
        requiredLevel: tt.min,
        yourLevel,
      };
    }
  }
  return closestGate ?? { allowed: false, reason: "คุณยังไม่มีไทป์ตรงกับผู้ใช้นี้" };
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
