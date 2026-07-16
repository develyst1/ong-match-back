import { describe, it, expect, beforeAll } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { createApp } from "../src/app";
import { UPLOAD_DIR } from "../src/routes/uploads";
import { migrate } from "../src/db/migrate";
import { makeUser } from "./helpers";

// 1x1 transparent PNG.
const PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC";

let H: Record<string, string>;

beforeAll(async () => {
  await migrate();
  H = (await makeUser(`up${Date.now()}@x.co`)).headers;
});

describe("uploads", () => {
  it("stores a data-url image and returns a served file URL", async () => {
    const app = createApp();
    const res = await app.request("/api/v1/uploads", {
      method: "POST",
      headers: H,
      body: JSON.stringify({ dataUrl: PNG }),
    });
    expect(res.status).toBe(200);
    const url = ((await res.json()) as { data: { url: string } }).data.url;
    expect(url).toContain("/uploads/");
    const name = url.split("/uploads/")[1];
    expect(existsSync(join(UPLOAD_DIR, name))).toBe(true);
  });

  it("rejects a non-image payload", async () => {
    const app = createApp();
    const res = await app.request("/api/v1/uploads", {
      method: "POST",
      headers: H,
      body: JSON.stringify({ dataUrl: "not-an-image" }),
    });
    expect(res.status).toBe(422);
  });

  it("rejects an unauthenticated upload", async () => {
    const app = createApp();
    const res = await app.request("/api/v1/uploads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dataUrl: PNG }),
    });
    expect(res.status).toBe(401);
  });
});
