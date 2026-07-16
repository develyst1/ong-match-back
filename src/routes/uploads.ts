import { Hono } from "hono";
import { z } from "zod";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { userMiddleware } from "../middleware/user";

export const UPLOAD_DIR = join(process.cwd(), "uploads");
const MAX_BYTES = 5 * 1024 * 1024; // 5MB after client-side downscale

/**
 * Accept a (client-downscaled) image data URL, store it as a static file, and
 * return its URL — so the DB keeps a short URL instead of a base64 blob that
 * would bloat every list/profile response.
 */
export function uploadsRoutes() {
  const r = new Hono<{ Variables: { userId: string } }>();
  r.use("*", userMiddleware);

  r.post("/uploads", async (c) => {
    const { dataUrl } = z.object({ dataUrl: z.string() }).parse(await c.req.json());
    const m = /^data:(image\/(png|jpeg|jpg|webp));base64,(.+)$/s.exec(dataUrl);
    if (!m) return c.json({ success: false, error: "รองรับเฉพาะไฟล์รูปภาพ" }, 422);

    const buf = Buffer.from(m[3], "base64");
    if (buf.length > MAX_BYTES) return c.json({ success: false, error: "ไฟล์ใหญ่เกินไป" }, 413);

    const ext = m[2] === "png" ? "png" : m[2] === "webp" ? "webp" : "jpg";
    const name = `${randomUUID()}.${ext}`;
    await mkdir(UPLOAD_DIR, { recursive: true });
    await writeFile(join(UPLOAD_DIR, name), buf);

    // Relative, same-origin URL — works behind any domain/proxy without config.
    return c.json({ success: true, data: { url: `/uploads/${name}` } });
  });

  return r;
}
