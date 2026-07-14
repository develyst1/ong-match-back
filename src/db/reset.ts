import { sql } from "./client";
import { migrate } from "./migrate";

/**
 * Full clean rebuild: drop every app table then re-create from schema.sql.
 * Destroys all data — intended for dev/demo only. Run `db:seed` afterwards.
 */
export async function reset(): Promise<void> {
  await sql`drop table if exists
    quizzes, type_tags, posts, follows, types, users cascade`;
  await migrate();
}

if (import.meta.main) {
  reset()
    .then(() => {
      console.log("reset + migrated");
      process.exit(0);
    })
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
