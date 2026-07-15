import { Hono } from "hono";
import { cors } from "hono/cors";
import { typesRoutes } from "./routes/types";
import { socialRoutes } from "./routes/social";
import { chatRoutes } from "./routes/chat";
import { roomsRoutes } from "./routes/rooms";
import { chat } from "./ai/client";
import type { ChatMsg } from "./ai/client";

/**
 * App factory. `chatFn` is injected so tests can stub the AI without a live call.
 */
export function createApp(chatFn: (m: ChatMsg[]) => Promise<string> = chat): Hono {
  const app = new Hono();
  app.use("*", cors());
  app.get("/health", (c) => c.json({ success: true, data: { status: "ok" } }));
  app.route("/api/v1", typesRoutes(chatFn));
  app.route("/api/v1", socialRoutes());
  app.route("/api/v1", chatRoutes());
  app.route("/api/v1", roomsRoutes());
  return app;
}
