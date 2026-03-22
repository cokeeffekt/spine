---
phase: 01-foundation
plan: "01"
subsystem: infra
tags: [bun, hono, sqlite, docker, typescript, ffmpeg]

# Dependency graph
requires: []
provides:
  - Bun project skeleton with hono@4.12.8 and bun:sqlite
  - TypeScript types: Book, Chapter, FfprobeOutput, NormalizedChapter, NormalizedMetadata
  - SQLite schema with books and chapters tables, WAL mode, foreign keys
  - Database singleton (openDatabase/getDatabase) using bun:sqlite
  - Hono server with GET /health endpoint at port 3000
  - Dockerfile with oven/bun:1-alpine and ffmpeg/ffprobe binary
  - docker-compose.yml with spine-data volume and audiobook directory mount
affects: [02-auth, 03-scanner, 04-api, 05-player, 06-offline]

# Tech tracking
tech-stack:
  added:
    - hono@4.12.8 (HTTP framework)
    - bun:sqlite (built-in Bun SQLite, replaces better-sqlite3)
    - bun@1.2.18 (runtime, installed locally)
    - ffmpeg/ffprobe (Docker system package)
  patterns:
    - bun:sqlite for database access (synchronous, built-in, no native bindings)
    - openDatabase(path) function pattern for testable DB initialization
    - getDatabase() singleton with DB_PATH env var
    - Hono app exported as named export for testability; Bun.serve() only in non-test mode

key-files:
  created:
    - package.json
    - tsconfig.json
    - Dockerfile
    - docker-compose.yml
    - src/types.ts
    - src/db/schema.ts
    - src/db/index.ts
    - src/server.ts
    - src/db/schema.test.ts
    - bun.lock
    - .gitignore
  modified: []

key-decisions:
  - "Use bun:sqlite (built-in) instead of better-sqlite3 — better-sqlite3 uses V8 C++ API incompatible with Bun's ABI locally; bun:sqlite provides identical synchronous API with zero dependencies"
  - "Export named app from server.ts instead of default — prevents Bun from auto-serving default export twice"
  - "WAL test uses /tmp file DB not :memory: — SQLite WAL mode does not apply to in-memory databases"
  - "bun.lock (YAML format, Bun 1.2+) replaces bun.lockb in Dockerfile COPY instruction"

patterns-established:
  - "Database module: openDatabase(path) creates and initializes; getDatabase() returns singleton reading DB_PATH env"
  - "Tests use bun:test; server avoids starting when NODE_ENV=test"
  - "Schema uses CREATE TABLE IF NOT EXISTS pattern for idempotent initialization"

requirements-completed: [INFRA-01, INFRA-02, INFRA-03, INFRA-04, SCAN-03]

# Metrics
duration: 7min
completed: 2026-03-22
---

# Phase 01 Plan 01: Project Foundation Summary

**Bun project skeleton with Hono server, bun:sqlite schema (books/chapters/WAL/FK), Docker container with ffprobe, and TypeScript types for .m4b audiobook metadata**

## Performance

- **Duration:** 7 min
- **Started:** 2026-03-22T02:51:10Z
- **Completed:** 2026-03-22T02:59:07Z
- **Tasks:** 2
- **Files modified:** 11

## Accomplishments
- Bun project initialized with hono@4.12.8, tsconfig.json with strict mode
- SQLite database module with books/chapters schema, WAL mode, foreign keys enabled
- Hono server with /health endpoint responding with `{ status: "ok", timestamp }`
- Docker infrastructure: oven/bun:1-alpine image + ffmpeg, docker-compose with spine-data volume
- All 5 TypeScript interfaces (Book, Chapter, FfprobeOutput, NormalizedChapter, NormalizedMetadata)
- 4 passing schema tests validating table columns, WAL mode, and foreign key enforcement

## Task Commits

Each task was committed atomically:

1. **Task 1: Project skeleton, types, and Docker infrastructure** - `1126af1` (feat)
2. **Task 2: SQLite schema, database module, and Hono server with /health** - `4e9e8e7` (feat)

**Plan metadata:** _(added below)_

## Files Created/Modified
- `package.json` - Bun project config with hono@4.12.8, scripts: dev/start/test
- `tsconfig.json` - TypeScript config with strict mode, bundler module resolution, bun-types
- `Dockerfile` - oven/bun:1-alpine with ffmpeg, multi-stage build
- `docker-compose.yml` - spine service with spine-data volume and audiobook mount
- `bun.lock` - Bun lockfile (YAML format, Bun 1.2+)
- `.gitignore` - node_modules, dist, *.db, *.db-wal, *.db-shm
- `src/types.ts` - FfprobeOutput, Book, Chapter, NormalizedChapter, NormalizedMetadata interfaces
- `src/db/schema.ts` - initializeDatabase() with books/chapters CREATE TABLE IF NOT EXISTS
- `src/db/index.ts` - openDatabase() and getDatabase() using bun:sqlite
- `src/server.ts` - Hono app with GET /health, Bun.serve() on PORT env
- `src/db/schema.test.ts` - 4 tests: books columns, chapters columns, WAL mode, foreign keys

## Decisions Made
- **bun:sqlite over better-sqlite3**: better-sqlite3 uses V8 C++ API (not N-API) which is incompatible with Bun 1.2.x locally. bun:sqlite is built into Bun, zero dependencies, identical synchronous API. All plan acceptance criteria are met: schema has correct tables, WAL mode works, foreign keys work.
- **Named app export**: Exporting `app` as named (not default) export prevents Bun from attempting to auto-serve the module twice.
- **WAL test uses file DB**: SQLite in-memory databases always use "memory" journal mode; WAL requires a file path. Test uses /tmp path with cleanup.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Switched from better-sqlite3 to bun:sqlite**
- **Found during:** Task 2 (schema tests)
- **Issue:** better-sqlite3 uses V8 C++ API (e.g., `FunctionTemplate::InstanceTemplate()`) incompatible with Bun 1.2.x — "undefined symbol" error even after rebuild. Cannot be fixed by recompilation; it's an API compatibility issue.
- **Fix:** Replaced better-sqlite3 with bun:sqlite (built into Bun). Updated schema.ts, index.ts, and schema.test.ts to use bun:sqlite query API. Removed better-sqlite3 and @types/better-sqlite3 from package.json.
- **Files modified:** src/db/schema.ts, src/db/index.ts, src/db/schema.test.ts, package.json, bun.lock
- **Verification:** All 4 schema tests pass with `bun test`
- **Committed in:** 4e9e8e7 (Task 2 commit)

**2. [Rule 1 - Bug] Fixed WAL test to use file-based database**
- **Found during:** Task 2 (WAL mode test)
- **Issue:** Test used `:memory:` database; SQLite always reports "memory" journal mode for in-memory DBs regardless of PRAGMA setting
- **Fix:** Updated WAL test to open /tmp/spine-test-wal.db (cleaned up in afterEach)
- **Files modified:** src/db/schema.test.ts
- **Verification:** WAL test passes and confirms "wal" journal mode
- **Committed in:** 4e9e8e7 (Task 2 commit)

**3. [Rule 1 - Bug] Fixed Dockerfile bun.lockb reference**
- **Found during:** Task 2 (Dockerfile review)
- **Issue:** Dockerfile referenced bun.lockb (old binary format) but Bun 1.2+ uses bun.lock (YAML format)
- **Fix:** Updated Dockerfile COPY instruction to use bun.lock
- **Files modified:** Dockerfile
- **Verification:** docker compose config validates successfully
- **Committed in:** 4e9e8e7 (Task 2 commit)

---

**Total deviations:** 3 auto-fixed (1 blocking, 2 bugs)
**Impact on plan:** bun:sqlite swap is necessary for tests to pass in Bun runtime. All acceptance criteria met. The schema, API surface, and behavior are identical to better-sqlite3 for synchronous SQLite access.

## Issues Encountered
- Bun 1.3.11 was initially installed; downgraded to 1.2.18 to match plan target. Still exhibited the same better-sqlite3 incompatibility — root cause is V8 C++ API changes, not Bun version.

## Known Stubs
None — all code is wired and functional. The /health endpoint returns live data.

## User Setup Required
None — no external service configuration required.

## Next Phase Readiness
- Project skeleton complete: Bun runtime, Hono framework, SQLite schema, Docker container
- All subsequent plans (auth, scanner, API, player, offline) can build on this foundation
- Database schema is ready for Phase 02 (auth: users/sessions tables) and Phase 03 (scanner: populating books/chapters)
- Docker container is ready to build with ffprobe available at /usr/bin/ffprobe

---
*Phase: 01-foundation*
*Completed: 2026-03-22*
