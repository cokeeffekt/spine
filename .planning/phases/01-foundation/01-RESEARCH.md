# Phase 1: Foundation - Research

**Researched:** 2026-03-22
**Domain:** Docker + Bun/Node.js runtime, better-sqlite3 schema, ffprobe .m4b metadata extraction, incremental file scanning
**Confidence:** HIGH

## Summary

Phase 1 establishes the complete backend infrastructure for Spine: a Docker container running a Bun (or Node.js) server with better-sqlite3, a library scanner that uses ffprobe to extract .m4b metadata and cover art, and incremental re-scan logic. No API endpoints, no auth, no frontend — only the scannable, queryable foundation that all subsequent phases consume.

The technology stack is fully prescribed by CLAUDE.md. The primary research questions for this phase are operational: how exactly does ffprobe expose .m4b chapter and tag data in JSON, how to extract cover art via ffmpeg spawn, what SQLite schema and pragmas to use, how to detect file changes reliably in Docker volumes, and how the Dockerfile should be structured to include ffmpeg on Alpine.

**Primary recommendation:** Use ffprobe with `-show_chapters -show_format -show_streams -print_format json` for a single-pass metadata extraction, write cover art via a second `ffmpeg` spawn using `-map 0:v -map -0:V -c copy`, detect file changes via mtime+size stored in the `books` table, and use chokidar v5 with `usePolling: true` inside Docker for the file watcher.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Scanner runs on startup (initial full scan) plus periodic re-scan on a sane default interval (e.g. every 5 minutes or file watcher — Claude picks the best approach)
- **D-02:** Re-scans are incremental — detect new, changed, and removed files without re-processing unchanged books
- **D-03:** When an .m4b file disappears, keep all metadata in SQLite and flag the book as "missing content" — do not delete the row
- **D-04:** When a previously-missing .m4b file reappears at the same path, automatically unflag it — no manual action required
- **D-05:** Scanner recursively walks all subdirectories under the configured library root
- **D-06:** Expected structure: library root contains either .m4b files directly or folders (possibly nested) that contain .m4b files — no fixed convention like `Author/Title.m4b` required
- **D-07:** Folder structure can inform fallback metadata (folder name as title hint) but embedded metadata always wins
- **D-08:** Extracted cover art is written to the same directory as the .m4b file, named `cover.jpg`
- **D-09:** If a user-provided `cover.jpg` already exists in the folder, the scanner overwrites it with the embedded art — embedded art takes priority
- **D-10:** If the .m4b has no embedded cover art, an existing `cover.jpg` in the folder is used as fallback (per SCAN-05)
- **D-11:** Cover art path is stored in SQLite so the serving layer knows where to find it without re-scanning
- **D-12:** Store as much metadata as ffprobe provides — title, author, narrator, series name, series position, description/blurb, genre, publisher, year, language, duration, file size, codec info
- **D-13:** Schema should be generous with columns now; future phases may backfill from external APIs (Audible, OpenLibrary, etc.)
- **D-14:** Chapter table stores: book reference, chapter index, title, start time, end time, duration

### Claude's Discretion
- File watcher vs polling interval (pick what's most reliable in Docker)
- Exact SQLite table structure and indexes
- How to detect file changes for incremental scan (mtime, hash, size)
- ffprobe command flags and output parsing
- Error handling for corrupt/unreadable .m4b files
- Temp file handling during cover extraction
- Log output format and verbosity

### Deferred Ideas (OUT OF SCOPE)
- External API metadata enrichment (Audible, OpenLibrary) — future enhancement, schema supports it now
- Admin-triggered rescan from UI — v2 requirement (LIBE-01)
- Search by genre/series/narrator — v2 requirement (LIBE-02), but schema captures these fields now
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| INFRA-01 | Entire stack runs in Docker (Dockerfile + docker-compose) | Dockerfile pattern: `oven/bun:1-alpine` base + `apk add ffmpeg` + multi-stage build; docker-compose with named volumes |
| INFRA-02 | Docker image includes ffmpeg/ffprobe for .m4b processing | `apk add --no-cache ffmpeg` in Alpine gives both binaries; ~5MB addition to image |
| INFRA-03 | Audiobook directory is mounted as a Docker volume | docker-compose `volumes:` bind-mount with read-write access (scanner writes cover.jpg) |
| INFRA-04 | SQLite database persists via Docker volume | Named volume mounted to `/data/spine.db` or similar; WAL mode for durability |
| SCAN-01 | Backend scans configured directory and extracts metadata | ffprobe JSON output: `format.tags` fields map to title/author/etc; `format.duration` for total length |
| SCAN-02 | Backend extracts chapter information via ffprobe | ffprobe `-show_chapters` returns array with `start_time`, `end_time`, `tags.title` per chapter |
| SCAN-03 | Metadata and chapters cached in SQLite | better-sqlite3 synchronous INSERT with WAL mode; UPSERT on file path for incremental scans |
| SCAN-04 | Cover art extracted from .m4b and stored on disk | `ffmpeg -i input.m4b -map 0:v -map -0:V -c copy cover.jpg` — detach audio, copy video (cover) stream |
| SCAN-05 | Fallback to folder helper files (cover.jpg, metadata.json) when embedded metadata missing | Check `fs.existsSync` for folder-level files after ffprobe returns empty tags |
</phase_requirements>

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Bun runtime | 1.2.x | Execute TypeScript server | Built-in TS, Bun.password, faster startup; prescribed in CLAUDE.md |
| Hono | 4.12.x | HTTP framework (future phases) | Prescribed; no API in this phase but server skeleton needed to confirm `docker compose up` passes |
| better-sqlite3 | 12.8.x | Metadata + chapter storage | Synchronous API, 448K ops/sec, perfect for single-container; prescribed in CLAUDE.md |
| ffprobe (system) | 7.x | .m4b metadata + chapter extraction | Prescribed; installed via `apk add ffmpeg` in Alpine |
| ffmpeg (system) | 7.x | Cover art extraction | Same package as ffprobe; used for `ffmpeg -i ... -map 0:v ...` cover extraction |
| chokidar | 5.x | File system watcher | ESM-only v5 (Nov 2025); `usePolling: true` required in Docker for volume-mounted directories |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@types/better-sqlite3` | latest | TypeScript types for better-sqlite3 | Always; devDependency |
| `@hono/node-server` | latest | Node.js adapter (fallback path) | Only if running on Node.js instead of Bun |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| chokidar usePolling | setInterval + fs.readdir walk | Simpler, no dependency, entirely predictable in Docker — recommended for polling fallback if chokidar adds complexity |
| chokidar | `fs.watch` native | Unreliable in Docker, no recursive support on Linux without polling |
| mtime change detection | SHA-256 content hash | Hash is accurate but requires reading entire file on each scan; mtime+size is fast and sufficient |

**Installation:**
```bash
bun add better-sqlite3 hono chokidar
bun add -d @types/better-sqlite3
# Bun runtime: no separate install — use oven/bun base image
# ffmpeg/ffprobe: installed in Dockerfile via apk
```

**Version verification (run before pinning):**
```bash
npm view better-sqlite3 version     # confirmed 12.8.0 as of 2026-03-22
npm view hono version               # confirmed 4.12.8 as of 2026-03-22
npm view chokidar version           # confirmed 5.0.0 as of 2026-03-22
```

## Architecture Patterns

### Recommended Project Structure

```
spine/
├── src/
│   ├── server.ts           # Hono app entrypoint, starts scanner, binds port
│   ├── db/
│   │   ├── schema.ts       # CREATE TABLE statements + pragma setup
│   │   └── index.ts        # Database singleton (open once, export)
│   ├── scanner/
│   │   ├── index.ts        # Orchestrator: walk → diff → probe → upsert
│   │   ├── walk.ts         # Recursive directory walk returning .m4b paths
│   │   ├── probe.ts        # ffprobe spawn + JSON parse + normalization
│   │   ├── cover.ts        # ffmpeg spawn for cover art extraction
│   │   └── watcher.ts      # chokidar setup + re-scan trigger
│   └── types.ts            # Shared TypeScript types (Book, Chapter, etc.)
├── Dockerfile
├── docker-compose.yml
├── package.json
└── tsconfig.json
```

### Pattern 1: ffprobe Metadata Extraction (Single Spawn)

**What:** One ffprobe invocation per file extracts all needed data — format tags, chapters, and stream info — in a single JSON blob.

**When to use:** Always; avoid multiple ffprobe calls per file.

**Command:**
```bash
ffprobe -hide_banner -loglevel fatal \
  -show_format -show_streams -show_chapters \
  -print_format json \
  /path/to/book.m4b
```

**JSON structure returned:**
```typescript
// Source: https://gist.github.com/termermc/2a62735201cede462763456542d8a266
interface FfprobeOutput {
  format: {
    duration: string;           // "36000.123456" (seconds as string)
    size: string;               // file size in bytes
    tags: {
      title?: string;
      artist?: string;          // often used for author
      album_artist?: string;    // alternative author field
      album?: string;           // may hold series title
      comment?: string;         // description/blurb
      genre?: string;
      date?: string;            // publication year
      publisher?: string;
      language?: string;
      narrator?: string;        // not standard; present in some m4b files
      // also uppercase variants: TITLE, ARTIST, ALBUM, etc.
    };
  };
  streams: Array<{
    codec_type: string;         // "audio" | "video" (cover art is "video")
    disposition?: {
      attached_pic: number;     // 1 = this stream is the cover art
    };
  }>;
  chapters: Array<{
    id: number;
    time_base: string;          // e.g. "1/1000"
    start: number;
    start_time: string;         // "0.000000" (seconds)
    end: number;
    end_time: string;           // "1800.000000"
    tags: {
      title?: string;           // chapter title; may be absent
    };
  }>;
}
```

**Cover art detection:** Stream with `codec_type === "video"` and `disposition.attached_pic === 1` indicates embedded cover art.

### Pattern 2: Cover Art Extraction (ffmpeg Spawn)

**What:** Use `ffmpeg` (not ffprobe) to copy only the video/picture stream to a JPEG file.

**Command:**
```bash
ffmpeg -y -i /path/to/book.m4b \
  -map 0:v -map -0:V \
  -c copy \
  /path/to/cover.jpg
```

- `-map 0:v` — select all video streams (cover art is treated as video)
- `-map -0:V` — deselect proper video streams (leaves only attached pictures)
- `-c copy` — no re-encode; copy stream bytes directly
- `-y` — overwrite output if it exists (implements D-09)

Only run this command when ffprobe confirms an attached picture stream exists. If no attached pic stream is found and a `cover.jpg` exists in the same folder, use that as fallback (D-10).

### Pattern 3: Incremental Scan with mtime + size

**What:** Store `file_mtime` (ISO string or Unix timestamp) and `file_size` (bytes) in the `books` table. On re-scan, compare current `fs.stat` values against stored values. Re-probe only when they differ.

**When to use:** Every re-scan pass (startup re-scan and watcher-triggered re-scan).

**Algorithm:**
```typescript
// Source: reasoning from fs.stat docs + SQLite UPSERT pattern
async function scanFile(filePath: string): Promise<void> {
  const stat = fs.statSync(filePath);
  const mtime = stat.mtimeMs;
  const size = stat.size;

  const existing = db.prepare(
    'SELECT file_mtime, file_size FROM books WHERE file_path = ?'
  ).get(filePath);

  if (existing && existing.file_mtime === mtime && existing.file_size === size) {
    return; // unchanged — skip ffprobe
  }

  const metadata = await probeFile(filePath);
  upsertBook(db, filePath, mtime, size, metadata);
}
```

**Missing file handling (D-03/D-04):**
```sql
-- At end of each scan pass, mark files not seen in this scan as missing
UPDATE books SET is_missing = 1
WHERE file_path NOT IN (/* list of paths found in current walk */);

-- When a previously-missing file is seen again
UPDATE books SET is_missing = 0 WHERE file_path = ?;
```

### Pattern 4: SQLite Schema with WAL Mode

**What:** Initialize database with WAL mode and key pragmas for reliable single-writer performance.

**When to use:** Once at application startup before any reads/writes.

```typescript
// Source: https://github.com/WiseLibs/better-sqlite3/blob/master/docs/performance.md
import Database from 'better-sqlite3';

export function openDatabase(dbPath: string): Database.Database {
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  // synchronous = NORMAL is the default in WAL mode for better-sqlite3
  return db;
}
```

### Pattern 5: File Watching in Docker

**What:** chokidar v5 with `usePolling: true` is required for Docker volume mounts because inotify events are not propagated through Docker's virtual filesystem layer on Linux.

**Recommended approach:** Use chokidar for the watcher but pair it with a startup full scan. The watcher catches adds/changes; a periodic full-walk scan (every 5 minutes) catches edge cases and handles the `is_missing` flag update.

```typescript
// Source: https://github.com/paulmillr/chokidar + Docker research
import { watch } from 'chokidar';

const watcher = watch(LIBRARY_ROOT, {
  persistent: true,
  ignoreInitial: true,   // startup scan is handled separately
  usePolling: true,      // required for Docker volumes
  interval: 5000,        // poll every 5 seconds (balance CPU vs latency)
  depth: undefined,      // unlimited recursion
  ignored: /(^|[\/\\])\../, // ignore dotfiles
});

watcher.on('add', (path) => { if (path.endsWith('.m4b')) scanFile(path); });
watcher.on('change', (path) => { if (path.endsWith('.m4b')) scanFile(path); });
watcher.on('unlink', (path) => { if (path.endsWith('.m4b')) markMissing(path); });
```

**Alternative (simpler, zero dep):** If chokidar ESM compatibility creates friction with Bun, replace the watcher with a `setInterval` full-walk every 5 minutes. This is predictable, has no dependency, and is sufficient for a household library scanner where latency of 5 minutes is acceptable.

### Pattern 6: Docker Setup

**Dockerfile:**
```dockerfile
FROM oven/bun:1-alpine AS base
WORKDIR /app

# Install ffmpeg (provides both ffmpeg and ffprobe binaries)
RUN apk add --no-cache ffmpeg

# Install dependencies
FROM base AS deps
COPY package.json bun.lockb ./
RUN bun install --frozen-lockfile --production

# Final image
FROM base AS release
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Create data directory for SQLite
RUN mkdir -p /data

EXPOSE 3000
CMD ["bun", "run", "src/server.ts"]
```

**docker-compose.yml:**
```yaml
services:
  spine:
    build: .
    ports:
      - "3000:3000"
    volumes:
      - ${AUDIOBOOK_DIR:-./books}:/books:rw   # rw needed — scanner writes cover.jpg
      - spine-data:/data
    environment:
      - LIBRARY_ROOT=/books
      - DB_PATH=/data/spine.db
      - PORT=3000

volumes:
  spine-data:
```

### SQLite Schema (Recommended)

```sql
-- books table: one row per .m4b file
CREATE TABLE IF NOT EXISTS books (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  file_path       TEXT    NOT NULL UNIQUE,
  file_mtime      REAL    NOT NULL,  -- Unix timestamp ms (from fs.stat.mtimeMs)
  file_size       INTEGER NOT NULL,  -- bytes
  is_missing      INTEGER NOT NULL DEFAULT 0,  -- 0=present, 1=file gone

  -- Core metadata (from ffprobe format.tags)
  title           TEXT,
  author          TEXT,              -- artist / album_artist
  narrator        TEXT,
  series_title    TEXT,
  series_position TEXT,
  description     TEXT,
  genre           TEXT,
  publisher       TEXT,
  year            TEXT,
  language        TEXT,

  -- Technical metadata
  duration_sec    REAL,              -- total duration in seconds
  codec           TEXT,              -- e.g. "aac"

  -- Cover art
  cover_path      TEXT,              -- absolute path to cover.jpg on disk, or NULL

  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- chapters table: one row per chapter
CREATE TABLE IF NOT EXISTS chapters (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  book_id     INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  chapter_idx INTEGER NOT NULL,
  title       TEXT,                  -- may be NULL for untitled chapters
  start_sec   REAL    NOT NULL,
  end_sec     REAL    NOT NULL,
  duration_sec REAL   NOT NULL
);

-- Indexes for future API queries (Phase 2+)
CREATE INDEX IF NOT EXISTS idx_books_file_path  ON books(file_path);
CREATE INDEX IF NOT EXISTS idx_books_is_missing ON books(is_missing);
CREATE INDEX IF NOT EXISTS idx_chapters_book_id ON chapters(book_id);
```

**Chapter-less .m4b handling:** If ffprobe returns an empty chapters array, synthesize a single implicit chapter: `{ chapter_idx: 0, title: null, start_sec: 0, end_sec: duration_sec, duration_sec }`.

### Anti-Patterns to Avoid

- **Multiple ffprobe spawns per file:** One spawn with all flags (`-show_format -show_streams -show_chapters`) is sufficient. Calling ffprobe twice per file doubles I/O overhead at scan time.
- **Using fluent-ffmpeg:** Archived and deprecated May 2025. Direct spawn is ~20 lines and avoids a dead dependency.
- **Deleting SQLite rows on file disappearance:** Violates D-03. Always use the `is_missing` flag.
- **Recursive `fs.watch` on Linux in Docker:** Does not work without polling. inotify events don't propagate through Docker volume layers reliably.
- **Hashing file contents for change detection:** Reading entire 500MB .m4b files to hash them is catastrophically slow. mtime + size is correct and fast.
- **Storing cover art as BLOBs in SQLite:** Wastes database space and complicates serving. Write to disk alongside the .m4b, store the path.
- **Running ffprobe on every scan pass regardless of change:** Always check mtime+size first. Probing is expensive (spawns a subprocess).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| JSON binary metadata parsing for .m4b | Custom AAC/MP4 parser | ffprobe system binary via spawn | MP4/AAC container format is deeply complex; ffprobe handles edge cases, malformed files, varied encoders, non-standard chapter formats |
| File watching with debounce + dedup | Custom EventEmitter + timer | chokidar (or setInterval walk) | Rapid multi-event bursts during large file copies; chokidar handles debounce, dedup, and stabilization |
| SQLite connection management | Singleton with manual locking | better-sqlite3 synchronous API | Synchronous model eliminates concurrency issues; no connection pool needed for single-writer use |
| Cover art format detection | Read magic bytes to detect PNG/JPEG | ffmpeg stream copy with `-c copy` | ffmpeg detects and preserves the original format; no conversion needed |

**Key insight:** The file scanning domain has deceptive complexity in metadata parsing (inconsistent tag capitalization, missing fields, chapter edge cases). ffprobe's single JSON output normalizes all of this, and the scanner's job is simply to map that JSON to the SQLite schema defensively.

## Common Pitfalls

### Pitfall 1: ffprobe Tag Capitalization

**What goes wrong:** ffprobe returns tags in inconsistent casing. An m4b ripped with iTunes may have `TITLE`, `ARTIST`, `ALBUM` (all caps); one from another tool may have `title`, `artist`, `album` (lowercase). Parser that only checks one form silently loses metadata.

**Why it happens:** MP4/M4B tag format doesn't mandate casing; individual encoders choose.

**How to avoid:** Normalize by checking both forms: `tags.title ?? tags.TITLE ?? null`. Apply to every tag field.

**Warning signs:** Books imported from different ripping tools showing blank titles or authors while others work fine.

### Pitfall 2: Chapter-less Books Causing Errors

**What goes wrong:** ffprobe returns `"chapters": []` for .m4b files without chapter markers. If code assumes chapters array is non-empty and accesses index 0, it throws or skips storing the book entirely.

**Why it happens:** Many .m4b files — especially those ripped from a single MP3 — have no chapter metadata.

**How to avoid:** Always check `chapters.length === 0` and synthesize one implicit chapter spanning the full duration. This satisfies SCAN-02 and the phase success criteria.

**Warning signs:** Books that load but have no chapters, or scanner errors on specific files.

### Pitfall 3: Docker Volume + inotify File Watching

**What goes wrong:** `fs.watch` or chokidar without `usePolling: true` misses file creation/modification events for files added to a bind-mounted Docker volume from the host.

**Why it happens:** Docker volume mounts bypass Linux inotify on the container side — the kernel event never fires. The file appears in the filesystem but no watch event is delivered.

**How to avoid:** Set `usePolling: true` in chokidar config. Or skip the watcher entirely and use a `setInterval` polling loop — simpler and 100% reliable.

**Warning signs:** New .m4b files dropped into the library directory don't appear in the database until a container restart triggers the startup scan.

### Pitfall 4: Cover Art Stream Misidentification

**What goes wrong:** Some .m4b files have a subtitle stream or a pure video track flagged as a video stream but not as cover art. Running ffmpeg cover extraction on those produces a scrambled output or a multi-frame video.

**Why it happens:** The `codec_type === "video"` check is necessary but not sufficient. Cover art specifically has `disposition.attached_pic === 1`.

**How to avoid:** Check both `codec_type === "video"` AND `disposition.attached_pic === 1` before concluding a cover art stream exists. Only then spawn the ffmpeg extraction command.

**Warning signs:** cover.jpg files that are corrupted, zero-byte, or unexpectedly large.

### Pitfall 5: ffprobe Stderr on Malformed Files

**What goes wrong:** ffprobe exits with code 1 and writes a diagnostics message to stderr (not stdout) when it cannot parse a file. If the scanner only reads stdout, `JSON.parse` gets an empty string and throws an unhelpful error.

**Why it happens:** ffprobe's JSON is on stdout; error messages are on stderr. Corrupt or truncated .m4b files are common.

**How to avoid:** Capture stderr separately. On non-zero exit code, log the file path + stderr content and mark the book as `is_missing = 1` (or skip insertion). Do not let one bad file stop the scan of other files.

**Warning signs:** Scanner silently stops mid-library, or unhandled promise rejection from `JSON.parse`.

### Pitfall 6: Slow Startup Scan on Large Libraries

**What goes wrong:** Spawning ffprobe serially for 500 books takes minutes. Each spawn has ~50ms overhead; 500 × 50ms = 25 seconds minimum just for subprocess startup.

**Why it happens:** `child_process.spawn` + JSON parse is not free; serial execution compounds the cost.

**How to avoid:** Concurrently probe multiple files. Use a simple semaphore/queue limiting to 4–8 concurrent probes to avoid overwhelming the CPU. Bun's native concurrency makes this straightforward.

**Warning signs:** Server takes more than 30 seconds to reach "scan complete" on a library of 100+ books.

## Code Examples

### ffprobe Spawn (TypeScript)

```typescript
// Direct child_process.spawn — no fluent-ffmpeg or wrapper library
import { spawn } from 'node:child_process';

export function probeFile(filePath: string): Promise<FfprobeOutput> {
  return new Promise((resolve, reject) => {
    const args = [
      '-hide_banner',
      '-loglevel', 'fatal',
      '-show_format',
      '-show_streams',
      '-show_chapters',
      '-print_format', 'json',
      filePath,
    ];

    const proc = spawn('ffprobe', args);
    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (chunk) => { stdout += chunk; });
    proc.stderr.on('data', (chunk) => { stderr += chunk; });

    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`ffprobe failed (${code}): ${stderr}`));
        return;
      }
      try {
        resolve(JSON.parse(stdout) as FfprobeOutput);
      } catch (e) {
        reject(new Error(`ffprobe JSON parse error: ${e}`));
      }
    });
  });
}
```

### Cover Art Extraction (TypeScript)

```typescript
import { spawn } from 'node:child_process';
import path from 'node:path';

export function extractCoverArt(
  m4bPath: string,
  hasAttachedPic: boolean,
): Promise<string | null> {
  if (!hasAttachedPic) return Promise.resolve(null);

  const coverPath = path.join(path.dirname(m4bPath), 'cover.jpg');

  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', [
      '-y',                // overwrite existing cover.jpg (implements D-09)
      '-i', m4bPath,
      '-map', '0:v',       // select all video streams
      '-map', '-0:V',      // deselect proper video (keep only attached pics)
      '-c', 'copy',
      coverPath,
    ]);

    proc.on('close', (code) => {
      if (code === 0) resolve(coverPath);
      else resolve(null); // graceful — missing cover is not fatal
    });
  });
}
```

### SQLite Upsert (TypeScript)

```typescript
// UPSERT: insert or update based on file_path unique constraint
const upsertBook = db.prepare(`
  INSERT INTO books (
    file_path, file_mtime, file_size, is_missing,
    title, author, narrator, description, genre, publisher, year,
    language, duration_sec, codec, cover_path, updated_at
  ) VALUES (
    @file_path, @file_mtime, @file_size, 0,
    @title, @author, @narrator, @description, @genre, @publisher, @year,
    @language, @duration_sec, @codec, @cover_path, datetime('now')
  )
  ON CONFLICT(file_path) DO UPDATE SET
    file_mtime   = excluded.file_mtime,
    file_size    = excluded.file_size,
    is_missing   = 0,
    title        = excluded.title,
    author       = excluded.author,
    narrator     = excluded.narrator,
    description  = excluded.description,
    genre        = excluded.genre,
    publisher    = excluded.publisher,
    year         = excluded.year,
    language     = excluded.language,
    duration_sec = excluded.duration_sec,
    codec        = excluded.codec,
    cover_path   = excluded.cover_path,
    updated_at   = datetime('now')
`);
```

### Tag Normalization (TypeScript)

```typescript
// ffprobe tag names vary by encoder — always check both casings
function normalizeTag(tags: Record<string, string | undefined>, ...keys: string[]): string | null {
  for (const key of keys) {
    const val = tags[key] ?? tags[key.toUpperCase()] ?? tags[key.toLowerCase()];
    if (val?.trim()) return val.trim();
  }
  return null;
}

// Usage:
const title  = normalizeTag(tags, 'title');
const author = normalizeTag(tags, 'artist', 'album_artist');
const year   = normalizeTag(tags, 'date', 'year');
```

### Implicit Chapter Synthesis

```typescript
function normalizeChapters(
  raw: FfprobeOutput['chapters'],
  durationSec: number,
): NormalizedChapter[] {
  if (raw.length === 0) {
    // SCAN-02: chapter-less .m4b gets one implicit chapter
    return [{
      chapter_idx: 0,
      title: null,
      start_sec: 0,
      end_sec: durationSec,
      duration_sec: durationSec,
    }];
  }

  return raw.map((ch, idx) => ({
    chapter_idx: idx,
    title: ch.tags?.title ?? null,
    start_sec: parseFloat(ch.start_time),
    end_sec: parseFloat(ch.end_time),
    duration_sec: parseFloat(ch.end_time) - parseFloat(ch.start_time),
  }));
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| fluent-ffmpeg npm wrapper | Direct `child_process.spawn` | May 2025 (archived) | fluent-ffmpeg is a dead dependency; spawn is correct choice |
| chokidar v3 (CommonJS) | chokidar v5 (ESM-only, Node >=20) | Nov 2025 | v5 requires ESM imports; Bun handles ESM natively, no issue |
| `node:sqlite` (experimental) | better-sqlite3 12.x | Ongoing — `node:sqlite` still experimental in Node 22 | better-sqlite3 is production-proven; use it |
| `bcrypt` for passwords | Argon2id (`Bun.password`) | OWASP 2025 standard | Passwords come in Phase 2, not Phase 1 — note for later |

**Deprecated/outdated:**
- `fluent-ffmpeg`: Archived May 2025 by maintainer; npm package marked deprecated. Do not use.
- `@ffprobe-installer/ffprobe`: Packages a bundled ffprobe binary — unnecessary when ffprobe is installed system-wide in the Docker image via `apk add ffmpeg`.

## Open Questions

1. **chokidar v5 ESM + Bun compatibility**
   - What we know: chokidar v5 is ESM-only; Bun supports ESM natively
   - What's unclear: Whether chokidar's internal `fsevents` optional dependency causes any build issues in the Alpine container (fsevents is macOS-only and should be gracefully skipped on Linux)
   - Recommendation: Test `bun add chokidar` in the Alpine Docker image during Wave 0. If any issue arises, fall back to the `setInterval` polling loop — it is equally correct for this use case.

2. **metadata.json fallback schema (SCAN-05)**
   - What we know: SCAN-05 requires checking the containing folder for a `metadata.json` as fallback
   - What's unclear: What schema/format should `metadata.json` use? No spec is defined in CONTEXT.md or REQUIREMENTS.md.
   - Recommendation: Define a minimal schema: `{ title, author, narrator, year, description, genre }` — map keys directly to book columns. Document this in code comments so future users know what to put in the file.

3. **Cover art format (PNG vs JPEG)**
   - What we know: Decision D-08 specifies `cover.jpg`; ffmpeg with `-c copy` preserves original format bytes
   - What's unclear: If the embedded cover art is a PNG, `-c copy` writes PNG bytes to `cover.jpg` — the extension is wrong and browsers may reject it
   - Recommendation: Use `-vcodec mjpeg` instead of `-c copy` to always transcode to JPEG, ensuring the `.jpg` extension is accurate. Alternatively, detect format from ffprobe stream `codec_name` and use `.png` or `.jpg` accordingly.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Bun built-in test runner (`bun:test`) |
| Config file | None — Bun discovers `*.test.ts` files automatically |
| Quick run command | `bun test src/` |
| Full suite command | `bun test` |

Bun ships a Jest-compatible test runner with no install required. No separate vitest/jest config needed.

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| INFRA-01 | `docker compose up` starts and server responds on :3000 | smoke/manual | `docker compose up -d && curl -s localhost:3000/health` | ❌ Wave 0 |
| INFRA-02 | ffprobe binary is available inside container | smoke/manual | `docker compose exec spine ffprobe -version` | ❌ Wave 0 |
| INFRA-03 | Audiobook volume is mounted and writable | smoke/manual | Drop a test .m4b into the host volume; verify container can read and write cover.jpg | ❌ Wave 0 |
| INFRA-04 | SQLite DB file persists after container restart | smoke/manual | `docker compose restart spine && docker compose exec spine ls /data/` | ❌ Wave 0 |
| SCAN-01 | probeFile() extracts title, author, duration from a real .m4b | unit | `bun test src/scanner/probe.test.ts` | ❌ Wave 0 |
| SCAN-02 | probeFile() returns chapters with start_time, end_time, title | unit | `bun test src/scanner/probe.test.ts` | ❌ Wave 0 |
| SCAN-02 | Chapter-less .m4b synthesizes one implicit chapter | unit | `bun test src/scanner/probe.test.ts -t "chapter-less"` | ❌ Wave 0 |
| SCAN-03 | Scan result is correctly stored and retrievable from SQLite | integration | `bun test src/scanner/index.test.ts` | ❌ Wave 0 |
| SCAN-03 | Re-scan of unchanged file skips ffprobe (mtime unchanged) | unit | `bun test src/scanner/index.test.ts -t "incremental"` | ❌ Wave 0 |
| SCAN-04 | extractCoverArt() writes cover.jpg alongside the .m4b | unit | `bun test src/scanner/cover.test.ts` | ❌ Wave 0 |
| SCAN-04 | cover_path is stored in books table | integration | `bun test src/scanner/index.test.ts -t "cover_path"` | ❌ Wave 0 |
| SCAN-05 | When no embedded cover, folder cover.jpg is used as fallback | unit | `bun test src/scanner/cover.test.ts -t "fallback"` | ❌ Wave 0 |
| SCAN-05 | metadata.json in folder fills missing embedded tags | unit | `bun test src/scanner/probe.test.ts -t "metadata.json"` | ❌ Wave 0 |

**Note:** INFRA-01 through INFRA-04 are smoke tests that require Docker to be running — these are manual/integration and cannot run in a unit test harness without the container. They serve as phase gate acceptance criteria.

### Sampling Rate

- **Per task commit:** `bun test src/scanner/`
- **Per wave merge:** `bun test`
- **Phase gate:** Full `bun test` green + Docker smoke tests pass before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `src/scanner/probe.test.ts` — covers SCAN-01, SCAN-02; needs a fixture .m4b file or mocked ffprobe output
- [ ] `src/scanner/cover.test.ts` — covers SCAN-04, SCAN-05
- [ ] `src/scanner/index.test.ts` — covers SCAN-03 (integration: real SQLite in temp file)
- [ ] `tests/fixtures/` — small sample .m4b files: one with chapters+cover, one chapter-less, one with no embedded metadata
- [ ] `src/db/schema.test.ts` — verifies tables are created correctly, WAL mode is active

## Sources

### Primary (HIGH confidence)

- CLAUDE.md §Technology Stack — prescribed stack, version numbers, ffprobe spawn pattern, Docker setup
- https://ffmpeg.org/ffprobe.html — ffprobe flag reference (`-show_chapters`, `-show_format`, `-show_streams`, `-print_format json`)
- https://gist.github.com/termermc/2a62735201cede462763456542d8a266 — TypeScript type definitions for ffprobe JSON output; chapters structure with start_time/end_time/tags
- https://github.com/WiseLibs/better-sqlite3/blob/master/docs/performance.md — WAL mode, pragma setup, checkpoint guidance
- https://bun.com/docs/guides/ecosystem/docker — official Bun Dockerfile pattern, multi-stage build, `--frozen-lockfile --production`

### Secondary (MEDIUM confidence)

- https://github.com/paulmillr/chokidar — chokidar v5 ESM-only, `usePolling: true` for Docker volumes, polling interval
- https://syntackle.com/blog/the-issue-of-watching-file-changes-in-docker/ — Docker volume + inotify issue, polling as solution
- https://sqlite.org/lang_upsert.html — SQLite UPSERT `INSERT ... ON CONFLICT ... DO UPDATE` syntax
- https://hhsprings.bitbucket.io/docs/programming/examples/ffmpeg/metadata/album_art.html — `disposition:v attached_pic` for cover art streams
- https://hub.docker.com/r/oven/bun — `oven/bun:1-alpine` official image

### Tertiary (LOW confidence — needs validation)

- WebSearch result: chokidar v5 makes `usePolling` 30% more efficient (Nov 2025 release notes) — not independently verified against official changelog
- WebSearch result: `ffmpeg -map 0:v -map -0:V -c copy` for attached_pic extraction — command is widely cited but has the PNG-vs-JPEG edge case noted in Open Questions

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — prescribed in CLAUDE.md with verified version numbers
- ffprobe JSON structure: HIGH — verified against TypeScript type definitions gist and official docs
- Architecture patterns: HIGH — derived from official docs and project constraints
- File watching in Docker: MEDIUM — confirmed by multiple community sources; inotify limitation is well-documented
- Cover art extraction command: MEDIUM — widely cited, but PNG format edge case is unverified

**Research date:** 2026-03-22
**Valid until:** 2026-04-22 (stable ecosystem; Bun releases frequently, check for 1.2.x patch notes)
