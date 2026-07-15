import { Hono } from "hono";
import { cors } from "hono/cors";
import { serveStatic } from "hono/bun";
import { authRoutes } from "./routes/auth";
import { typesRoutes } from "./routes/types";
import { socialRoutes } from "./routes/social";
import { chatRoutes } from "./routes/chat";
import { roomsRoutes } from "./routes/rooms";
import { uploadsRoutes } from "./routes/uploads";
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
  // Public: the only routes that don't require a token.
  app.route("/api/v1", authRoutes());
  app.route("/api/v1", typesRoutes(chatFn));
  app.route("/api/v1", socialRoutes());
  app.route("/api/v1", chatRoutes());
  app.route("/api/v1", roomsRoutes());
  app.route("/api/v1", uploadsRoutes());
  return app;
}
