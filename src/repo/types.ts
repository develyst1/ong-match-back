import { sql } from "../db/client";
import { RULES } from "../config/rules";

export interface TypeRow {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  level: number;
  status: string;
  first_created_at: string;
  expires_at: string;
}

export async function createType(userId: string, title: string, description: string, tags: string[]): Promise<TypeRow> {
  const rows = await sql<TypeRow[]>`
    insert into types (user_id, title, description, expires_at)
    values (${userId}, ${title}, ${description}, now() + ${`${RULES.expiryDays} days`}::interval)
    returning *`;
  const t = rows[0];
  if (tags.length) {
    await sql`insert into type_tags ${sql(tags.map((tag) => ({ type_id: t.id, tag })))} on conflict do nothing`;
  }
  return t;
}

export async function getType(typeId: string): Promise<TypeRow | null> {
  const rows = await sql<TypeRow[]>`select * from types where id = ${typeId}`;
  return rows[0] ?? null;
}

export async function setLevel(typeId: string, level: number): Promise<void> {
  await sql`update types set level = ${level} where id = ${typeId}`;
}

export async function listMyTypes(userId: string) {
  const rows = await sql<(TypeRow & { days_left: number })[]>`
    select *, greatest(0, ceil(extract(epoch from (expires_at - now())) / 86400))::int as days_left
    from types where user_id = ${userId} order by created_at desc`;
  return rows.map((r) => {
    const status = new Date(r.expires_at) < new Date() ? "expired" : "active";
    return { ...r, status, daysLeft: r.days_left };
  });
}
