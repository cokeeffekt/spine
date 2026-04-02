# Spine

A self-hosted audiobook platform that turns a folder of `.m4b` and `.mp3` files into a browser-based listening experience. Browse your library, stream or download books for offline play, and pick up exactly where you left off — on any device.

## Features

- Library browser with cover art, search, and metadata
- Full player with chapter navigation, speed control, and skip
- **MP3 folder support** — a folder of `.mp3` files is treated as one audiobook with automatic track ordering
- Progress tracking — resume across devices with server sync
- Lock-screen / notification controls (Media Session API)
- Offline mode — download whole books for offline playback with seeking
- Multi-user with separate accounts and progress
- Admin panel — manage users, trigger library rescans with live progress
- Metadata enrichment from Audnexus (cover art, description, narrator, series)
- PWA — installable, works offline

## Quick Start

1. Edit `docker-compose.yml` — set the path to your audiobook directory:

```yaml
volumes:
  - /path/to/your/audiobooks:/books:ro
```

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

## MP3 Folder Support

Spine treats a folder of `.mp3` files as a single audiobook:

- Tracks are sorted by ID3 track number (with filename fallback)
- Multi-disc layouts (`Disc 1/`, `Disc 2/` subfolders) are flattened into one book
- Metadata (title, author, cover) is pulled from ID3 tags, with folder name fallback
- The player handles seamless track transitions and cross-track seeking

Just put your MP3 audiobook folders alongside your `.m4b` files and rescan.

## Configuration

All configuration is in `docker-compose.yml`:

| Setting | Default | Description |
|---------|---------|-------------|
| Port mapping | `3002:3000` | Host port : container port |
| Book volume | — | Mount your audiobook directory to `/books` |
| `ADMIN_USERNAME` | _(none)_ | Auto-create admin user on first run |
| `ADMIN_PASSWORD` | _(none)_ | Password for auto-created admin |
| `SCAN_INTERVAL_MS` | `300000` | Library rescan interval (5 min) |

The SQLite database is stored in a named Docker volume (`spine-data`) so it persists across container restarts.

## Tech Stack

- **Runtime:** Bun (in Docker)
- **Backend:** Hono + bun:sqlite
- **Frontend:** Alpine.js + Workbox PWA (no build step)
- **Media:** ffprobe for metadata and chapter extraction
