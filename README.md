# Spine

A self-hosted audiobook platform that turns a folder of `.m4b` files into a browser-based listening experience. Browse your library, stream or download books for offline play, and pick up exactly where you left off — on any device.

## Features

- Library browser with cover art, search, and metadata
- Full player with chapter navigation, speed control, and skip
- Progress tracking — resume across devices
- Lock-screen / notification controls (Media Session API)
- Offline mode — download whole books for offline playback with seeking
- Multi-user with separate accounts and progress
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
- A folder of `.m4b` audiobook files

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
- **Backend:** Hono + better-sqlite3
- **Frontend:** Alpine.js + Workbox PWA (no build step)
- **Media:** ffprobe for `.m4b` metadata and chapter extraction
