import { sql } from "../db/client";

/** Canonical ordering so a user pair maps to exactly one conversation row. */
const order = (a: string, b: string): [string, string] => (a < b ? [a, b] : [b, a]);

export async function getOrCreateConversation(a: string, b: string): Promise<{ id: string }> {
  const [lo, hi] = order(a, b);
  const rows = await sql<{ id: string }[]>`
    insert into conversations (user_lo, user_hi) values (${lo}, ${hi})
    on conflict (user_lo, user_hi) do update set user_lo = excluded.user_lo
    returning id`;
  return rows[0];
}

export interface ConversationSummary {
  id: string;
  peer_id: string;
  peer_name: string | null;
  peer_avatar: string | null;
  last_message: string | null;
  last_message_at: string | null;
}

export async function listConversations(userId: string): Promise<ConversationSummary[]> {
  return sql<ConversationSummary[]>`
    select c.id,
      (case when c.user_lo = ${userId} then c.user_hi else c.user_lo end) as peer_id,
      u.display_name as peer_name,
      u.avatar_url as peer_avatar,
      m.content as last_message,
      m.created_at as last_message_at
    from conversations c
    join users u on u.id = (case when c.user_lo = ${userId} then c.user_hi else c.user_lo end)
    left join lateral (
      select content, created_at from messages
      where conversation_id = c.id order by created_at desc limit 1
    ) m on true
    where c.user_lo = ${userId} or c.user_hi = ${userId}
    order by coalesce(m.created_at, c.created_at) desc`;
}

export async function isMember(convId: string, userId: string): Promise<boolean> {
  const rows = await sql`
    select 1 from conversations
    where id = ${convId} and (user_lo = ${userId} or user_hi = ${userId})`;
  return rows.length > 0;
}

export interface MessageRow {
  id: string;
  sender_id: string;
  content: string;
  created_at: string;
}

export async function listMessages(convId: string, afterIso?: string): Promise<MessageRow[]> {
  if (afterIso) {
    return sql<MessageRow[]>`
      select id, sender_id, content, created_at from messages
      where conversation_id = ${convId} and created_at > ${afterIso}
      order by created_at asc limit 200`;
  }
  return sql<MessageRow[]>`
    select id, sender_id, content, created_at from messages
    where conversation_id = ${convId} order by created_at asc limit 200`;
}

export async function insertMessage(convId: string, senderId: string, content: string): Promise<MessageRow> {
  const rows = await sql<MessageRow[]>`
    insert into messages (conversation_id, sender_id, content)
    values (${convId}, ${senderId}, ${content})
    returning id, sender_id, content, created_at`;
  return rows[0];
}
