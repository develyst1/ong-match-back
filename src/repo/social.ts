import { sql } from "../db/client";

export interface FeedItem {
  id: string;
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  content: string;
  type_title: string | null;
  type_level: number | null;
  source: "you" | "following" | "recommended";
  created_at: string;
}

export async function createPost(userId: string, content: string, typeId: string | null): Promise<{ id: string }> {
  const rows = await sql<{ id: string }[]>`
    insert into posts (user_id, content, type_id) values (${userId}, ${content}, ${typeId})
    returning id`;
  return rows[0];
}

export interface UserPost {
  id: string;
  content: string;
  type_title: string | null;
  type_level: number | null;
  created_at: string;
}

/** A single user's own posts (for their profile), newest first. */
export async function userPosts(userId: string): Promise<UserPost[]> {
  return sql<UserPost[]>`
    select p.id, p.content, p.created_at, t.title as type_title, t.level as type_level
    from posts p
    left join types t on t.id = p.type_id
    where p.user_id = ${userId}
    order by p.created_at desc
    limit 40`;
}

/** Recent posts, tagged by relationship to the caller (you / following / recommended). */
export async function getFeed(userId: string): Promise<FeedItem[]> {
  const rows = await sql<(Omit<FeedItem, "source"> & { followed: boolean; is_self: boolean })[]>`
    select p.id, p.user_id, u.display_name, u.avatar_url, p.content, p.created_at,
           t.title as type_title, t.level as type_level,
           (p.user_id = ${userId}) as is_self,
           exists(select 1 from follows f where f.follower_id = ${userId} and f.followee_id = p.user_id) as followed
    from posts p
    join users u on u.id = p.user_id
    left join types t on t.id = p.type_id
    order by p.created_at desc
    limit 60`;
  return rows.map((r) => ({
    ...r,
    source: r.is_self ? "you" : r.followed ? "following" : "recommended",
  }));
}

export async function follow(followerId: string, followeeId: string): Promise<void> {
  await sql`insert into follows (follower_id, followee_id) values (${followerId}, ${followeeId})
    on conflict do nothing`;
}

export async function unfollow(followerId: string, followeeId: string): Promise<void> {
  await sql`delete from follows where follower_id = ${followerId} and followee_id = ${followeeId}`;
}
