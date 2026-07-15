import { describe, it, expect } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { createApp } from "../src/app";
import { UPLOAD_DIR } from "../src/routes/uploads";

const H = { "Content-Type": "application/json", "x-user-email": "up@x.co" };
// 1x1 transparent PNG.
const PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC";

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
});
