import { Hono } from "hono";
import { z } from "zod";
import { userMiddleware } from "../middleware/user";
import { createPost, getFeed, follow, unfollow, userPosts } from "../repo/social";
import { searchTypes, matchingPeople, getPublicProfile, canContact, trendingTags } from "../repo/people";
import { getUserById, updateUser, PG_UNIQUE_VIOLATION, type UserRow } from "../repo/users";

/** Map a DB user row to the camelCase shape the frontend expects. */
function toUserResponse(u: UserRow) {
  return {
    id: u.id,
    displayName: u.display_name ?? u.email.split("@")[0],
    bio: u.bio ?? "",
    age: u.age ?? 0,
    location: u.location ?? "",
    avatarUrl: u.avatar_url ?? "",
    coverUrl: u.cover_url ?? "",
    phone: u.phone ?? "",
    primaryTribeId: "",
    interestIds: [] as string[],
    activityLevel: u.activity_level ?? "MEDIUM",
    createdAt: u.created_at,
  };
}

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

  r.get("/tags/trending", async (c) => {
    const tags = await trendingTags();
    return c.json({ success: true, data: tags });
  });

  // Current user's own profile — must be registered before "/users/:id"
  // so the literal "me" isn't captured as an :id (and parsed as a uuid).
  r.get("/users/me", async (c) => {
    const u = await getUserById(c.get("userId"));
    if (!u) return c.json({ success: false, error: "user not found" }, 404);
    return c.json({ success: true, data: toUserResponse(u) });
  });

  r.put("/users/me", async (c) => {
    const body = z
      .object({
        displayName: z.string().optional(),
        bio: z.string().optional(),
        age: z.number().optional(),
        location: z.string().optional(),
        avatarUrl: z.string().optional(),
        coverUrl: z.string().optional(),
        phone: z.string().optional(),
        activityLevel: z.enum(["LOW", "MEDIUM", "HIGH"]).optional(),
      })
      .parse(await c.req.json());
    try {
      const u = await updateUser(c.get("userId"), body);
      return c.json({ success: true, data: toUserResponse(u) });
    } catch (e) {
      if ((e as { code?: string })?.code === PG_UNIQUE_VIOLATION) {
        return c.json({ success: false, error: "เบอร์นี้ถูกใช้สมัครแล้ว" }, 409);
      }
      throw e;
    }
  });

  r.get("/users/:id/can-contact", async (c) => {
    const check = await canContact(c.get("userId"), c.req.param("id"));
    return c.json({ success: true, data: check });
  });

  r.get("/users/:id/posts", async (c) => {
    const posts = await userPosts(c.req.param("id"));
    return c.json({ success: true, data: posts });
  });

  r.get("/users/:id", async (c) => {
    const profile = await getPublicProfile(c.req.param("id"));
    if (!profile) return c.json({ success: false, error: "user not found" }, 404);
    return c.json({ success: true, data: profile });
  });

  return r;
}
