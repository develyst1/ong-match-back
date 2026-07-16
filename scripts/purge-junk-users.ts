/**
 * One-off cleanup of junk user rows created before real auth existed.
 *
 * Deletes:
 *   - passwordless accounts that are NOT demo seed (@ong.demo) — created by the
 *     old "any email logs in" flow (typed garbage, guest/dev test identities)
 *   - @real.co accounts — throwaway test registrations
 * Keeps: @ong.demo seed users + every real account with a password (not @real.co).
 * Cascades remove any deleted user's types/posts/chats.
 *
 * Run:  bun run scripts/purge-junk-users.ts        (preview only)
 *       bun run scripts/purge-junk-users.ts --yes  (actually delete)
 */
import { sql } from "../src/db/client";

const JUNK = sql`
  (password_hash is null and email not like ${"%@ong.demo"})
  or email like ${"%@real.co"}
`;

const preview = await sql<{ email: string }[]>`select email from users where ${JUNK} order by email`;
console.log(`Junk users matched: ${preview.length}`);
preview.forEach((r) => console.log("  -", r.email));

if (process.argv.includes("--yes")) {
  const del = await sql`delete from users where ${JUNK} returning email`;
  const rest = await sql<{ n: number }[]>`select count(*)::int n from users`;
  console.log(`\nDeleted ${del.length} junk users. Remaining users: ${rest[0].n}`);
} else {
  console.log("\nPreview only. Re-run with --yes to delete.");
}

await sql.end();
process.exit(0);
