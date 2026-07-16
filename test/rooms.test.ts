import { describe, it, expect } from "bun:test";
import { migrate } from "../src/db/migrate";
import { createApp } from "../src/app";
import { makeUser } from "./helpers";
import { createType } from "../src/repo/types";
const data = async (r: Response): Promise<any> => (await r.json() as { data: unknown }).data;

describe("group rooms", () => {
  it("gates by tag membership, then lets members chat and see each other", async () => {
    await migrate();
    const stamp = Date.now();
    const tag = `ดนตรีRM${stamp}`;
    const a = await makeUser(`rmA${stamp}@x.co`);
    const b = await makeUser(`rmB${stamp}@x.co`);
    const c = await makeUser(`rmC${stamp}@x.co`);
    await sqlName(a.id, "เอ");
    await sqlName(b.id, "บี");

    // A and B share the tag; C does not.
    await createType(a.id, `กีตาร์${stamp}`, "", [tag]);
    await createType(b.id, `กลอง${stamp}`, "", [tag]);
    await createType(c.id, `กาแฟ${stamp}`, "", [`กาแฟ${stamp}`]);

    const app = createApp();
    const hA = a.headers;
    const hB = b.headers;
    const hC = c.headers;
    const path = `/api/v1/rooms/${encodeURIComponent(tag)}/messages`;

    // Non-member C is blocked from reading and posting.
    expect((await app.request(path, { headers: hC })).status).toBe(403);
    expect(
      (await app.request(path, { method: "POST", headers: hC, body: JSON.stringify({ content: "hi" }) })).status,
    ).toBe(403);

    // A posts; B (a member) sees it as not-mine with A's name.
    await app.request(path, { method: "POST", headers: hA, body: JSON.stringify({ content: "ใครเล่นสเกลไมเนอร์บ้าง" }) });
    const bMsgs = await data(await app.request(path, { headers: hB }));
    expect(bMsgs.length).toBe(1);
    expect(bMsgs[0].isMine).toBe(false);
    expect(bMsgs[0].sender_name).toBe("เอ");
    expect(bMsgs[0].content).toBe("ใครเล่นสเกลไมเนอร์บ้าง");

    // Room list for A shows the tag with a member count of 2 (A + B).
    const rooms = await data(await app.request("/api/v1/rooms", { headers: hA }));
    const room = rooms.find((x: { tag: string }) => x.tag === tag);
    expect(room.members).toBe(2);
    expect(room.last_message).toBe("ใครเล่นสเกลไมเนอร์บ้าง");
  });
});

// Small helper to give a seeded user a display name.
import { sql } from "../src/db/client";
async function sqlName(userId: string, name: string) {
  await sql`update users set display_name = ${name} where id = ${userId}`;
}
