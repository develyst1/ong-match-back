import { Hono } from "hono";
import { z } from "zod";
import { userMiddleware } from "../middleware/user";
import { createPost, getFeed, follow, unfollow } from "../repo/social";
import { searchTypes, matchingPeople, getPublicProfile } from "../repo/people";

/** Feed, posts, follows, type search, matching people, public profiles. */
export function socialRoutes() {
  const r = new Hono<{ Variables: { userId: string } }>();
  r.use("*", userMiddleware);

  r.get("/feed", async (c) => {
    const feed = await getFeed(c.get("userId"));
    return c.json({ success: true, data: feed });
  });

  r.post("/posts", async (c) => {
    const body = z
      .object({ content: z.string().min(1), typeId: z.string().nullable().optional() })
      .parse(await c.req.json());
    const post = await createPost(c.get("userId"), body.content, body.typeId ?? null);
    return c.json({ success: true, data: post });
  });

  r.post("/users/:id/follow", async (c) => {
    await follow(c.get("userId"), c.req.param("id"));
    return c.json({ success: true, data: { following: true } });
  });

  r.delete("/users/:id/follow", async (c) => {
    await unfollow(c.get("userId"), c.req.param("id"));
    return c.json({ success: true, data: { following: false } });
  });

  r.get("/types/search", async (c) => {
    const q = (c.req.query("q") ?? "").trim();
    const tagsRaw = c.req.query("tags") ?? "";
    const tags = tagsRaw ? tagsRaw.split(",").map((t) => t.trim()).filter(Boolean) : [];
    const results = await searchTypes(q, tags);
    return c.json({ success: true, data: results });
  });

  r.get("/people/matches", async (c) => {
    const people = await matchingPeople(c.get("userId"));
    return c.json({ success: true, data: people });
  });

  r.get("/users/:id", async (c) => {
    const profile = await getPublicProfile(c.req.param("id"));
    if (!profile) return c.json({ success: false, error: "user not found" }, 404);
    return c.json({ success: true, data: profile });
  });

  return r;
}
