import { readFileSync } from "node:fs";
import { join } from "node:path";
import { sql } from "./client";

export async function migrate(): Promise<void> {
  const ddl = readFileSync(join(import.meta.dir, "schema.sql"), "utf8");
  await sql.unsafe(ddl);
}

if (import.meta.main) {
  migrate()
    .then(() => {
      console.log("migrated");
      process.exit(0);
    })
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
