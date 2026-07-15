import { Hono } from "hono";
import { z } from "zod";
import { userMiddleware } from "../middleware/user";
import { myRooms, isRoomMember, roomMessages, insertRoomMessage } from "../repo/rooms";

/** Group chat ("ไทป์รูม"): one room per tag, membership = having a type with the tag. */
export function roomsRoutes() {
  const r = new Hono<{ Variables: { userId: string } }>();
  r.use("*", userMiddleware);

  r.get("/rooms", async (c) => {
    const rooms = await myRooms(c.get("userId"));
    return c.json({ success: true, data: rooms });
  });

  r.get("/rooms/:tag/messages", async (c) => {
    const tag = decodeURIComponent(c.req.param("tag"));
    const me = c.get("userId");
    if (!(await isRoomMember(me, tag))) return c.json({ success: false, error: "ต้องมีไทป์ในกลุ่มนี้ก่อน" }, 403);
    const after = c.req.query("after") || undefined;
    const rows = await roomMessages(tag, after);
    return c.json({ success: true, data: rows.map((m) => ({ ...m, isMine: m.sender_id === me })) });
  });

  r.post("/rooms/:tag/messages", async (c) => {
    const tag = decodeURIComponent(c.req.param("tag"));
    const me = c.get("userId");
    if (!(await isRoomMember(me, tag))) return c.json({ success: false, error: "ต้องมีไทป์ในกลุ่มนี้ก่อน" }, 403);
    const { content } = z.object({ content: z.string().min(1) }).parse(await c.req.json());
    const m = await insertRoomMessage(tag, me, content);
    return c.json({ success: true, data: { ...m, isMine: true } });
  });

  return r;
}
