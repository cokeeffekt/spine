import { Database } from "bun:sqlite";
import * as fs from "fs";
import { authorMatches } from "../src/convert/audible.ts";

const APPLY = process.env["APPLY"] === "1";
const db = APPLY ? new Database("/data/spine.db") : new Database("/data/spine.db", { readonly: true });
if (APPLY) db.run("PRAGMA busy_timeout=20000");

// The genuinely-wrong matches all live under these real author folders (a /books/<Author>/<book>
// layout). A book here whose current author doesn't match the folder author (allowing the
// Bachman pseudonym and the "Phillip"/"Philip" folder typo via last-name comparison) is a wrong
// match to reconvert. Other library entries are 1-level book/series folders and are left alone.
const AUTHOR_FOLDERS: Array<{ prefix: string; names: string[] }> = [
  { prefix: "/books/Stephen King/", names: ["Stephen King", "Richard Bachman"] },
  { prefix: "/books/Phillip K. Dick/", names: ["Philip K. Dick"] },
];

const rows = db
  .query(
    `SELECT b.id, b.title, b.author, b.file_path, j.id AS job_id, j.source_path
     FROM books b JOIN conversion_jobs j ON j.output_path = b.file_path
     WHERE j.status = 'completed'`
  )
  .all() as Array<{ id: number; title: string; author: string | null; file_path: string; job_id: number; source_path: string }>;

const wrong = rows.filter((b) => {
  const folder = AUTHOR_FOLDERS.find((f) => b.source_path.startsWith(f.prefix));
  if (!folder || !b.author) return false;
  // Keep if the author matches any accepted name for this folder; otherwise it's a wrong match.
  return !folder.names.some((n) => authorMatches(b.author!, [{ name: n }]) || authorMatches(n, [{ name: b.author! }]));
});

console.log(`Wrong-match books to reconvert: ${wrong.length}`);
for (const b of wrong) console.log(`  "${b.author} / ${b.title}"  <- ${b.source_path.replace("/books/", "")}`);

if (!APPLY) {
  console.log("\n(DRY RUN — set APPLY=1)");
  process.exit(0);
}

let files = 0;
const tx = db.transaction(() => {
  for (const b of wrong) {
    db.run(`DELETE FROM chapters WHERE book_id = ?`, [b.id]);
    db.run(`DELETE FROM progress WHERE book_id = ?`, [b.id]);
    db.run(`DELETE FROM books WHERE id = ?`, [b.id]);
    db.run(`DELETE FROM conversion_jobs WHERE id = ?`, [b.job_id]); // next scan re-enqueues
  }
});
tx();
for (const b of wrong) {
  try { if (fs.existsSync(b.file_path)) { fs.rmSync(b.file_path); files++; } } catch { /* ignore */ }
}
console.log(`\nDeleted ${wrong.length} book rows + jobs, removed ${files} files. Next scan re-enqueues + reconverts.`);
