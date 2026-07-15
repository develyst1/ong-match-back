import { Hono } from "hono";
import { z } from "zod";
import { userMiddleware } from "../middleware/user";
import { canContact } from "../repo/people";
import {
  getOrCreateConversation,
  listConversations,
  isMember,
  listMessages,
  insertMessage,
} from "../repo/chat";

/** Real 1:1 chat: conversations gated by canContact + polling-friendly messages. */
export function chatRoutes() {
  const r = new Hono<{ Variables: { userId: string } }>();
  r.use("*", userMiddleware);

  r.post("/conversations", async (c) => {
    const { targetUserId } = z.object({ targetUserId: z.string() }).parse(await c.req.json());
    const me = c.get("userId");
    if (targetUserId === me) return c.json({ success: false, error: "คุยกับตัวเองไม่ได้" }, 400);
    // Enforce the contact gate server-side (the UI lock is bypassable).
    const gate = await canContact(me, targetUserId);
    if (!gate.allowed) return c.json({ success: false, error: gate.reason }, 403);
    const conv = await getOrCreateConversation(me, targetUserId);
    return c.json({ success: true, data: { id: conv.id } });
  });

  r.get("/conversations", async (c) => {
    const list = await listConversations(c.get("userId"));
    return c.json({ success: true, data: list });
  });

  r.get("/conversations/:id/messages", async (c) => {
    const id = c.req.param("id");
    const me = c.get("userId");
    if (!(await isMember(id, me))) return c.json({ success: false, error: "forbidden" }, 403);
    const after = c.req.query("after") || undefined;
    const rows = await listMessages(id, after);
    return c.json({ success: true, data: rows.map((m) => ({ ...m, isMine: m.sender_id === me })) });
  });

  r.post("/conversations/:id/messages", async (c) => {
    const id = c.req.param("id");
    const me = c.get("userId");
    if (!(await isMember(id, me))) return c.json({ success: false, error: "forbidden" }, 403);
    const { content } = z.object({ content: z.string().min(1) }).parse(await c.req.json());
    const m = await insertMessage(id, me, content);
    return c.json({ success: true, data: { ...m, isMine: true } });
  });

  return r;
}
