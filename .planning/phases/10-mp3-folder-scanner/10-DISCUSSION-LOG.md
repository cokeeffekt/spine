# Phase 10: MP3 Folder Scanner - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-24
**Phase:** 10-mp3-folder-scanner
**Areas discussed:** Folder detection, Book identity & schema, Track ordering, Multi-disc handling

---

## Folder Detection

| Option | Description | Selected |
|--------|-------------|----------|
| Any folder with .mp3 files | Every folder with ≥1 .mp3 becomes a book candidate. Simple, catches everything. | ✓ |
| Minimum file count threshold | Require 2+ MP3 files. Prevents stray single files. | |
| Metadata heuristic | Probe first MP3 for consistent album/artist tags. More accurate but slower. | |

**User's choice:** Any folder with .mp3 files
**Notes:** None

---

### Single standalone .mp3 files

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, treat like .m4b | A lone .mp3 becomes a single-track book. | |
| No, require a folder | Only folders with MP3 files become books. Stray .mp3 files ignored. | ✓ |
| You decide | Claude picks. | |

**User's choice:** No, require a folder

---

### Mixed .m4b + .mp3 folders

| Option | Description | Selected |
|--------|-------------|----------|
| m4b wins, ignore mp3s | The .m4b becomes the book. .mp3 files in same folder ignored. | ✓ |
| Both become separate books | .m4b is one book, .mp3 folder another. | |

**User's choice:** m4b wins, ignore mp3s

---

### Nested folders

| Option | Description | Selected |
|--------|-------------|----------|
| Only leaf folders | A folder is a book only if no child folders also contain .mp3 files. | ✓ |
| Every folder with mp3s | Each folder with .mp3 files is its own book regardless of nesting. | |

**User's choice:** Only leaf folders

---

### Multi-disc override of leaf rule

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, disc subfolders merge up | Disc/CD/Part subfolders merge into parent as one book. | ✓ |
| Each disc folder is its own book | Simpler but fragmented. | |

**User's choice:** Yes, disc subfolders merge up

---

### Folder path as metadata fallback

User volunteered that books are often in `/Author/Title/trackN.mp3` structure, so the path carries metadata.

| Option | Description | Selected |
|--------|-------------|----------|
| Author/Title/ | Parent = title, grandparent = author. Only when ID3 tags missing. | ✓ |
| Just Title/ | Parent = title only. Author from ID3 or nothing. | |

**User's choice:** Author/Title/ (grandparent = author, parent = title)

---

## Book Identity & Schema

| Option | Description | Selected |
|--------|-------------|----------|
| Folder path as file_path | Set file_path to folder path for MP3 books. Reuses existing unique column. | ✓ |
| New book_type column + tracks table | Add book_type to books, new tracks table. More explicit. | |
| Separate mp3_books table | Parallel table. Clean separation but doubles query complexity. | |

**User's choice:** Folder path as file_path

---

### Duration

| Option | Description | Selected |
|--------|-------------|----------|
| Sum of all track durations | Probe each .mp3, sum durations. Consistent with m4b. | ✓ |
| Probe first file, estimate total | Faster but inaccurate. | |

**User's choice:** Sum of all track durations

---

### Tracks storage

| Option | Description | Selected |
|--------|-------------|----------|
| New tracks table | Separate table for tracks. Keeps concepts separate. | |
| Reuse chapters table | Each MP3 track becomes a chapter. Simpler schema. | ✓ |

**User's choice:** Reuse chapters table
**Notes:** User preferred simplicity. Phase 11 player needs to distinguish file boundaries — solved by adding file_path column to chapters.

---

### Chapter file_path column

| Option | Description | Selected |
|--------|-------------|----------|
| Add file_path to chapters | Nullable column. NULL for m4b, populated for MP3 tracks. | ✓ |
| Add book_type to books instead | Player checks book_type for behavior. | |

**User's choice:** Add file_path to chapters

---

### Incremental scan for MP3 folders

| Option | Description | Selected |
|--------|-------------|----------|
| Folder mtime + total mp3 size | Store folder mtime + sum of .mp3 sizes. Re-probe if either changes. | ✓ |
| Track-level mtime checking | Per-track mtime+size. More granular but complex. | |

**User's choice:** Folder mtime + total size

---

### ASIN for enrichment

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, derive from ID3 tags | Check comment/custom tags for ASIN. | ✓ |
| No enrichment for MP3 books | Simpler but misses enrichment. | |

**User's choice:** Yes, derive from ID3 tags if available

---

## Track Ordering

| Option | Description | Selected |
|--------|-------------|----------|
| ID3 track number, filename fallback | TRCK tag primary, natural filename sort fallback. | ✓ |
| Filename natural sort only | Ignore ID3 tags, always sort by filename. | |

**User's choice:** ID3 track number, filename fallback

---

### Gaps and duplicates

| Option | Description | Selected |
|--------|-------------|----------|
| Ignore gaps, deduplicate by filename | Sort by track number, ignore gaps, break ties with filename. No warnings. | ✓ |
| Warn on gaps/duplicates | Log warnings but proceed. | |

**User's choice:** Ignore gaps, deduplicate by filename

---

## Multi-Disc Handling

### Disc folder patterns

| Option | Description | Selected |
|--------|-------------|----------|
| Disc/CD/Part + number | Match Disc, CD, Part, Disk + number (case-insensitive). | ✓ |
| Any numbered subfolder | Broader matching, could false-positive. | |

**User's choice:** Disc/CD/Part + number

---

### Disc ordering

| Option | Description | Selected |
|--------|-------------|----------|
| Folder name number | Extract disc number from folder name. Sort discs by this. | ✓ |
| ID3 disc number tag (TPOS) | Use TPOS from first file per subfolder. | |

**User's choice:** Folder name number

---

### Mixed loose files + disc subfolders

| Option | Description | Selected |
|--------|-------------|----------|
| Loose files first, then disc subfolders | Treat loose .mp3s as "Disc 0" before disc subfolders. | |
| Ignore loose files if disc subfolders exist | Only include files from disc subfolders. | ✓ |

**User's choice:** Ignore loose files if disc subfolders exist

---

## Claude's Discretion

- Exact regex for disc subfolder pattern matching
- Deeply nested disc structures (Disc 1/Part A/)
- Parallel vs sequential track probing
- Cover art extraction for MP3 folders
- Error handling for corrupt .mp3 files
- `has_chapters` behavior for MP3 books

## Deferred Ideas

None
