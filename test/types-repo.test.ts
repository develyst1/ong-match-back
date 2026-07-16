import { describe, it, expect } from "bun:test";
import { migrate } from "../src/db/migrate";
import { makeUser } from "./helpers";
import { createType, listMyTypes, setLevel } from "../src/repo/types";

describe("types-repo", () => {
  it("creates a type with ~30d expiry and lists it", async () => {
    await migrate();
    const u = await makeUser(`t${Date.now()}@x.co`);
    const t = await createType(u.id, "ชอบเล่นกีตาร์", "เล่นมานาน", ["กีตาร์", "ดนตรี"]);
    await setLevel(t.id, 40);
    const list = await listMyTypes(u.id);
    const found = list.find((x) => x.id === t.id)!;
    expect(found.level).toBe(40);
    expect(found.daysLeft).toBeGreaterThan(28);
    expect(found.status).toBe("active");
  });
});
