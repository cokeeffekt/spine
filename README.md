# Spine

A self-hosted audiobook platform that turns a folder of `.m4b` and `.mp3` files into a browser-based listening experience. Browse your library, stream or download books for offline play, and pick up exactly where you left off — on any device.

## Features

- Library browser with cover art, search, and metadata
- Full player with chapter navigation, speed control, and skip
- **MP3 folder support** — a folder of `.mp3` files is treated as one audiobook with automatic track ordering
- **Library materialization** — automatically converts every book into a clean, fully-tagged, chaptered single `.m4b` (see below)
- **Metadata enrichment** from Audible + Audnexus: cover art, description, narrator, series + position, year, genre, language, publisher
- Progress tracking — resume across devices with server sync
- Lock-screen / notification controls (Media Session API)
- Offline mode — download whole books for offline playback with seeking
- Multi-user with separate accounts and progress
- Admin panel — manage users, trigger rescans, and watch conversions with live progress
- PWA — installable, works offline

## Quick Start

1. Edit `docker-compose.yml` — set the path to your source audiobook directory (read-only) and a **separate writable directory** for the converted library:

```yaml
volumes:
  - /path/to/your/audiobooks:/books:ro      # source (can be read-only)
  - /path/to/converted-library:/converted   # writable — generated .m4b files go here
environment:
  - LIBRARY_ROOTS=/books,/converted
  - CONVERT_OUTPUT_DIR=/converted
```

> **Why a separate directory?** The source library is never modified, so it's safe to point `/books` at a read-only mount (e.g. a torrent-seeding directory). Converted `.m4b` files are written to `/converted`, which is scanned as a second library root.

2. Optionally set admin credentials (auto-created on first run):

```yaml
environment:
  - ADMIN_USERNAME=admin
  - ADMIN_PASSWORD=changeme
```

3. Run:

```bash
docker compose up --build
```

4. Open **http://localhost:3002**

## Requirements

- Docker
- A folder of `.m4b` audiobook files and/or folders of `.mp3` files
- A writable directory for the converted library

## Library Materialization (MP3 → M4B)

Spine converts every source book into a single, properly-tagged, chaptered `.m4b` in the
`/converted` library, then serves that in place of the original. This fixes the common
problems with raw MP3-folder audiobooks: no embedded chapters, junk filename-based tags, and
per-track streaming.

**How it works**

- Conversion jobs are created automatically during each library scan (one per source book).
- A background worker processes them **one at a time** (transcoding is CPU-heavy):
  - **MP3 folders** are concatenated and transcoded to AAC.
  - **Existing `.m4b`** files are **losslessly remuxed** (`-c:a copy`, no quality loss) to
    apply corrected chapters/cover/tags.
- The result is written to `/converted/<Author>/<Title>.m4b`, ingested, and the original
  source book is **superseded** (hidden) in the library. Originals are never modified or
  deleted.

**Metadata resolution** (per field, highest priority first)

- **title / author** — admin edit → folder name (for MP3 folders, whose tags are often junk)
  or embedded tags (for `.m4b`) → the other source.
- **narrator, series + position, description, year, genre, language, publisher** — admin edit
  → embedded tags → Audible/Audnexus lookup (gap-fill only; never overwrites existing values).
- **cover** — embedded art / folder image → Audnexus image (downloaded locally).
- **ASIN** — embedded tag → Audible catalog search by title + author.

**Chapter strategy** (best available source)

1. Embedded chapters (if the file already has them)
2. Per-file chapters (multi-file MP3 folders — one chapter per track)
3. Authoritative Audnexus chapters (validated against runtime) — used for 1–2 large files
4. Silence detection (`ffmpeg silencedetect`)
5. Fixed-interval "Part N" chapters (last resort)

**Admin → Conversions tab**

Lists every job with live progress (SSE), the chapter source used, and any error. You can edit
a book's metadata and re-convert, or retry a failed job.

## MP3 Folder Support

Spine treats a folder of `.mp3` files as a single audiobook:

- Tracks are sorted by ID3 track number (with filename fallback)
- Multi-disc layouts (`Disc 1/`, `Disc 2/` subfolders) are flattened into one book
- A folder with a single `.mp3` is also treated as a book
- Metadata (title, author, cover) is pulled from ID3 tags, with folder-name fallback

Just put your MP3 audiobook folders alongside your `.m4b` files and rescan.

## Configuration

All configuration is in `docker-compose.yml`:

| Setting | Default | Description |
|---------|---------|-------------|
| Port mapping | `3002:3000` | Host port : container port |
| `/books` volume | — | Source audiobook directory (may be read-only) |
| `/converted` volume | — | Writable directory for generated `.m4b` files |
| `LIBRARY_ROOTS` | `/books` | Comma-separated list of roots to scan (e.g. `/books,/converted`) |
| `CONVERT_OUTPUT_DIR` | `/converted` | Where materialized `.m4b` files are written |
| `CONVERT_ENABLED` | `true` | Set to `false` to disable the conversion pipeline |
| `CONVERT_BITRATE` | `64k` | AAC bitrate for MP3 transcodes (m4b remux is lossless) |
| `CONVERT_CHANNELS` | `1` | AAC channel count (1 = mono, typical for spoken word) |
| `LIBRARY_CONVERTED_ONLY` | `false` | When `true`, the library shows only converted books (under `CONVERT_OUTPUT_DIR`); un-converted sources are hidden until materialized |
| `CONVERT_MONO_FILES` | `2` | A folder with ≤ this many files is "monolithic" → chapters are derived rather than per-file |
| `CONVERT_FIXED_CHAPTER_SEC` | `900` | Fixed chapter length (s) for the last-resort chapterizer |
| `AUDIBLE_REGION` | `us` | Audible region for catalog search (`us`, `uk`, `ca`, `au`, …) |
| `ADMIN_USERNAME` | _(none)_ | Auto-create admin user on first run |
| `ADMIN_PASSWORD` | _(none)_ | Password for auto-created admin |
| `SCAN_INTERVAL_MS` | `300000` | Library rescan interval (5 min) |
| `LIBRARY_ROOT` | `/books` | Legacy single-root fallback (use `LIBRARY_ROOTS` instead) |

The SQLite database, extracted covers, and conversion temp files are stored under `/data`
(a named Docker volume, `spine-data`) so they persist across container restarts.

## Tech Stack

- **Runtime:** Bun (in Docker)
- **Backend:** Hono + bun:sqlite
- **Frontend:** Alpine.js + Workbox PWA (no build step)
- **Media:** `ffprobe` for metadata/chapters, `ffmpeg` for cover extraction and MP3→M4B conversion
- **Enrichment:** Audible catalog search + Audnexus (book details and chapters)
