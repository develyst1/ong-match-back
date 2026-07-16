import { describe, it, expect } from "bun:test";
import { migrate } from "../src/db/migrate";
import { makeUser } from "./helpers";
import { createType } from "../src/repo/types";
import { trendingTags } from "../src/repo/people";

describe("trendingTags", () => {
  it("clusters types by tag and counts distinct people", async () => {
    await migrate();
    const stamp = Date.now();
    const tag = `กีตาร์TST${stamp}`;
    const a = await makeUser(`trA${stamp}@x.co`);
    const b = await makeUser(`trB${stamp}@x.co`);

    // Two different people, both tagged with the shared tag → people = 2.
    await createType(a.id, `กีตาร์ไฟฟ้า${stamp}`, "", [tag, `ดนตรีTST${stamp}`]);
    await createType(b.id, `กีตาร์โปร่ง${stamp}`, "", [tag]);

    const rows = await trendingTags(1000);
    const found = rows.find((r) => r.tag === tag);
    expect(found).toBeDefined();
    expect(found!.people).toBe(2);
    expect(found!.types).toBe(2);
    expect(found!.sample_titles.length).toBeGreaterThan(0);
  });
});
