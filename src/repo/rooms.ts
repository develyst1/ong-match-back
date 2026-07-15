import { sql } from "../db/client";

export interface RoomSummary {
  tag: string;
  members: number;
  last_message: string | null;
  last_message_at: string | null;
}

/** Tag-rooms the user belongs to (has an active type with that tag). */
export async function myRooms(userId: string): Promise<RoomSummary[]> {
  return sql<RoomSummary[]>`
    with my_tags as (
      select distinct tt.tag
      from type_tags tt join types t on t.id = tt.type_id
      where t.user_id = ${userId} and t.expires_at > now()
    )
    select mt.tag,
      (select count(distinct t2.user_id)::int
         from type_tags x join types t2 on t2.id = x.type_id
         where x.tag = mt.tag and t2.expires_at > now()) as members,
      m.content as last_message,
      m.created_at as last_message_at
    from my_tags mt
    left join lateral (
      select content, created_at from group_messages
      where tag = mt.tag order by created_at desc limit 1
    ) m on true
    order by coalesce(m.created_at, to_timestamp(0)) desc, mt.tag asc`;
}

/** Membership check: does the user have an active type carrying this tag? */
export async function isRoomMember(userId: string, tag: string): Promise<boolean> {
  const rows = await sql`
    select 1 from type_tags tt join types t on t.id = tt.type_id
    where t.user_id = ${userId} and t.expires_at > now() and tt.tag = ${tag} limit 1`;
  return rows.length > 0;
}

export interface RoomMessageRow {
  id: string;
  sender_id: string;
  sender_name: string | null;
  content: string;
  created_at: string;
}

export async function roomMessages(tag: string, afterIso?: string): Promise<RoomMessageRow[]> {
  if (afterIso) {
    return sql<RoomMessageRow[]>`
      select gm.id, gm.sender_id, u.display_name as sender_name, gm.content, gm.created_at
      from group_messages gm join users u on u.id = gm.sender_id
      where gm.tag = ${tag} and gm.created_at > ${afterIso}
      order by gm.created_at asc limit 200`;
  }
  return sql<RoomMessageRow[]>`
    select gm.id, gm.sender_id, u.display_name as sender_name, gm.content, gm.created_at
    from group_messages gm join users u on u.id = gm.sender_id
    where gm.tag = ${tag}
    order by gm.created_at asc limit 200`;
}

export async function insertRoomMessage(tag: string, senderId: string, content: string): Promise<RoomMessageRow> {
  const rows = await sql<RoomMessageRow[]>`
    with ins as (
      insert into group_messages (tag, sender_id, content)
      values (${tag}, ${senderId}, ${content})
      returning id, sender_id, content, created_at
    )
    select ins.id, ins.sender_id, u.display_name as sender_name, ins.content, ins.created_at
    from ins join users u on u.id = ins.sender_id`;
  return rows[0];
}
