import { describe, it, expect } from "bun:test";
import { migrate } from "../src/db/migrate";
import { createApp } from "../src/app";
import { makeUser } from "./helpers";
import { createType, setLevel, setMinContactLevel } from "../src/repo/types";

/** Read the `data` payload from a Hono test Response (typed loosely for tests). */
const data = async (r: Response): Promise<any> => (await r.json() as { data: unknown }).data;

describe("chat", () => {
  it("gates conversation creation then allows chatting once eligible", async () => {
    await migrate();
    const stamp = Date.now();
    const a = await makeUser(`chatA${stamp}@x.co`);
    const b = await makeUser(`chatB${stamp}@x.co`);

    // Both share the tag "กีตาร์"; A is level 50 in the shared type.
    const ta = await createType(a.id, `กีตาร์A${stamp}`, "", ["กีตาร์"]);
    await setLevel(ta.id, 50);
    const tb = await createType(b.id, `กีตาร์B${stamp}`, "", ["กีตาร์"]);

    const app = createApp();
    const hA = a.headers;
    const hB = b.headers;

    // B requires level 90 → A (50) is blocked.
    await setMinContactLevel(tb.id, b.id, 90);
    const blocked = await app.request("/api/v1/conversations", {
      method: "POST", headers: hA, body: JSON.stringify({ targetUserId: b.id }),
    });
    expect(blocked.status).toBe(403);

    // Lower to 40 → A (50) can now start the conversation.
    await setMinContactLevel(tb.id, b.id, 40);
    const created = await app.request("/api/v1/conversations", {
      method: "POST", headers: hA, body: JSON.stringify({ targetUserId: b.id }),
    });
    expect(created.status).toBe(200);
    const convId = (await data(created)).id as string;

    // Idempotent: same pair returns the same conversation.
    const again = await app.request("/api/v1/conversations", {
      method: "POST", headers: hB, body: JSON.stringify({ targetUserId: a.id }),
    });
    expect((await data(again)).id).toBe(convId);

    // A sends a message; B sees it (not mine); polling with `after` works.
    await app.request(`/api/v1/conversations/${convId}/messages`, {
      method: "POST", headers: hA, body: JSON.stringify({ content: "หวัดดีเพื่อนสายกีตาร์" }),
    });
    const bView = await app.request(`/api/v1/conversations/${convId}/messages`, { headers: hB });
    const bMsgs = await data(bView);
    expect(bMsgs.length).toBe(1);
    expect(bMsgs[0].isMine).toBe(false);
    expect(bMsgs[0].content).toBe("หวัดดีเพื่อนสายกีตาร์");

    // A sees the same message as mine.
    const aView = await app.request(`/api/v1/conversations/${convId}/messages`, { headers: hA });
    expect((await data(aView))[0].isMine).toBe(true);

    // A non-member is forbidden.
    const cUser = await makeUser(`chatC${stamp}@x.co`);
    const hC = cUser.headers;
    const forbidden = await app.request(`/api/v1/conversations/${convId}/messages`, { headers: hC });
    expect(forbidden.status).toBe(403);

    // Conversation list shows the peer + last message.
    const list = await app.request("/api/v1/conversations", { headers: hA });
    const convs = await data(list);
    const found = convs.find((x: { id: string }) => x.id === convId);
    expect(found.peer_id).toBe(b.id);
    expect(found.last_message).toBe("หวัดดีเพื่อนสายกีตาร์");
  });
});
