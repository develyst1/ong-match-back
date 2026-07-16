import { Hono } from "hono";
import { cors } from "hono/cors";
import { serveStatic } from "hono/bun";
import { ZodError } from "zod";
import { typesRoutes } from "./routes/types";
import { socialRoutes } from "./routes/social";
import { chatRoutes } from "./routes/chat";
import { roomsRoutes } from "./routes/rooms";
import { uploadsRoutes } from "./routes/uploads";
import { authRoutes } from "./routes/auth";
import { chat } from "./ai/client";
import type { ChatMsg } from "./ai/client";

/**
 * App factory. `chatFn` is injected so tests can stub the AI without a live call.
 */
export function createApp(chatFn: (m: ChatMsg[]) => Promise<string> = chat): Hono {
  const app = new Hono();
  app.use("*", cors());
  app.get("/health", (c) => c.json({ success: true, data: { status: "ok" } }));
  // Serve uploaded images statically (browser-cacheable; not shipped in JSON).
  app.use("/uploads/*", serveStatic({ root: "./" }));
  app.route("/api/v1", authRoutes()); // public: register + login
  app.route("/api/v1", typesRoutes(chatFn));
  app.route("/api/v1", socialRoutes());
  app.route("/api/v1", chatRoutes());
  app.route("/api/v1", roomsRoutes());
  app.route("/api/v1", uploadsRoutes());

  // Invalid request bodies (Zod) become clean 400s instead of leaking 500s.
  app.onError((err, c) => {
    if (err instanceof ZodError) {
      return c.json({ success: false, error: err.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง" }, 400);
    }
    console.error(err);
    return c.json({ success: false, error: "เกิดข้อผิดพลาดในระบบ" }, 500);
  });

  return app;
}
