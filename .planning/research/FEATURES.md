# Feature Research

**Domain:** Self-hosted audiobook PWA (Audible replacement)
**Researched:** 2026-03-22
**Confidence:** HIGH (cross-verified against Audible, Audiobookshelf, community self-hosting reports)

---

## Feature Landscape

### Table Stakes (Users Expect These)

These come from the Audible baseline and community self-hosting reports. If Spine is missing any of these, it will feel like a downgrade — not a replacement.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Library browse view with cover art | Every audiobook app has this; cover art is how users identify books | LOW | Grid + list toggle is standard; cover extracted from .m4b at scan time |
| Audio playback with background support | Core function; background audio is table stakes on mobile | LOW | HTML5 `<audio>` with `play()` suspended/resumed; must not pause when screen locks |
| Playback speed control (0.5x–3.0x) | Audible supports 0.5x–3.5x; heavy listeners live at 1.5x–2x | LOW | Per-book memory is a usability improvement, not required for v1 |
| +30s / -30s skip buttons | Universal in every audiobook app; users have muscle memory for these | LOW | Configurable skip intervals are a v1.x enhancement |
| Chapter navigation | .m4b files embed chapters; users expect to see and jump to them | MEDIUM | Requires ffprobe extraction at scan time; chapter list UI in player |
| Resume from last position | The single most important playback feature; losing position is unforgivable | MEDIUM | Requires persistent progress storage; IndexedDB for local-first |
| Offline playback of downloaded books | Stated project requirement; offline is a primary motivation for leaving Audible | HIGH | Full book download via Cache Storage + IndexedDB; Service Worker intercepts requests |
| Lock-screen / notification playback controls | On Android/iOS, users control audio from notification tray without unlocking | MEDIUM | Media Session API; supports play/pause/seek/chapter; well-supported in 2026 |
| Per-user progress isolation | Household use: each person has their own position in each book | MEDIUM | Requires auth + user-scoped progress records |
| Login / authentication | Multi-user household needs real accounts, not just name-picker | MEDIUM | Username/password + session tokens; bcrypt hashing |
| PWA installability (Add to Home Screen) | Users expect app-like experience; browser tab feels provisional | LOW | Web App Manifest + Service Worker registration; one-time setup |
| Search / filter library | Even a 50-book library becomes navigable with search | LOW | Client-side filter on loaded library data is sufficient for small household |

### Differentiators (Competitive Advantage)

These are features that make Spine better than Audible for this specific use case, or features that self-hosted platforms typically do better because there's no commercial incentive against them.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Local-first progress (offline writes) | Progress saves even with no network; sync is a bonus not a requirement | MEDIUM | IndexedDB as source of truth; sync to backend is additive; Audible loses progress on network failures |
| Zero vendor lock-in | Users own their library and data; no subscription expiry | LOW | Architecture decision, not a feature to build — but worth surfacing in UX copy |
| Per-book speed memory | Remembers that you listen to fiction at 1.0x and non-fiction at 1.8x | LOW | Store speed per-book-per-user in progress record alongside position |
| "End of chapter" sleep timer | Pause at the end of the current chapter rather than mid-sentence | MEDIUM | Requires knowing current chapter end time; available from extracted chapter data |
| Progress sync conflict resolution | When local and server differ, show both and let user choose | MEDIUM | Relevant when same user listens on two offline devices; prevents silent data loss |
| Clean chapter scrubber | Visual timeline showing chapter boundaries; tap to jump | MEDIUM | SVG or canvas progress bar with chapter markers overlaid |
| Keyboard / media-key support on desktop | Desktop users expect spacebar to pause, arrow keys to seek | LOW | Media Session API covers media keys; spacebar/arrow binding in player component |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Real-time progress sync (WebSocket push) | "I want my position to update instantly on all devices" | Adds persistent connection complexity, server-side event broadcasting, conflict handling — all for marginal gain in a household of 3-4 people | Manual sync on resume: fetch server position when app comes back online, merge with local |
| Per-chapter offline downloads | "I only want to download chapter 3" | Streaming .m4b by byte-range makes chapter segmentation complex; .m4b is a single file | Whole-book download is simpler and matches actual usage (users finish books) |
| Transcoding / format conversion | "Can I add MP3 folders?" | Transcoding is a heavy server-side concern; multiplies edge cases; ffmpeg is complex | Scope to .m4b only; the user's entire library is already .m4b |
| Social features (ratings, reviews, recommendations) | "It would be cool to see what my household thinks" | Scope creep; adds data model complexity; household of 3-4 doesn't need a social graph | Out of scope by design; maybe a simple "favorites" flag later |
| Native mobile apps (iOS/Android) | "The PWA isn't as good as a real app" | Significant parallel codebase; App Store compliance overhead; PWA covers the gaps | Invest in PWA quality: Media Session API, offline download, installability — these close the gap |
| Automatic metadata scraping from external sources | "Fetch cover art from Audible/Google Books automatically" | External API dependencies, rate limits, legal gray areas, maintenance burden | ffprobe extracts embedded metadata and cover art from .m4b at scan time — no external calls needed |
| Reading/listening sync (Whispersync-style) | "Sync position between ebook and audiobook" | Requires an ebook reader component; doubles the scope | Out of scope; audiobook-only is the stated constraint |
| Sleep timer with arbitrary durations | "I want exactly 23 minutes" | UI complexity for marginal gain | Fixed presets (5, 10, 15, 30, 60 min) plus "end of chapter" covers 95% of use |

---

## Feature Dependencies

```
[Auth / User Accounts]
    └──required by──> [Per-user Progress Tracking]
                          └──required by──> [Progress Sync to Backend]
                          └──enables──> [Resume from Last Position]

[Service Worker Registration]
    └──required by──> [Offline Playback]
                          └──required by──> [Whole-book Download]
    └──required by──> [PWA Installability]

[.m4b Scan + ffprobe Extraction]
    └──required by──> [Chapter Navigation]
                          └──enables──> [End-of-Chapter Sleep Timer]
                          └──enables──> [Chapter Scrubber UI]
    └──required by──> [Library Browse with Cover Art]
    └──required by──> [REST API (book details, streaming)]

[Media Session API]
    └──enables──> [Lock-screen Controls]
    └──enables──> [Keyboard / Media-key Support]

[Progress Tracking (local IndexedDB)]
    └──enables──> [Resume from Last Position]
    └──enhances──> [Progress Sync to Backend]

[REST API Streaming]
    └──required by──> [Audio Playback]
    └──required by──> [Chapter Navigation]
```

### Dependency Notes

- **Auth requires nothing external** but must exist before per-user progress is meaningful. Build auth first even if a single admin account.
- **Service Worker must be registered before** any offline feature works. Registering it is cheap; defer the full offline caching logic to a later phase.
- **ffprobe extraction gates most UX quality.** Chapter navigation, accurate cover art, and proper duration all depend on solid scan-time extraction. This is the highest-risk foundational step.
- **Local progress (IndexedDB) is independent of the backend.** Resume-from-position works fully offline before sync is implemented. Sync is additive.
- **Media Session API enhances an already-working player.** It can be added in any phase after basic playback works.

---

## MVP Definition

### Launch With (v1)

The minimum that makes Spine feel like a real replacement rather than a prototype.

- [ ] Library browse — grid with cover art, title, author, duration
- [ ] In-browser audio player — play/pause, +30s/-30s, chapter list, speed control
- [ ] Resume from last position — local-first via IndexedDB, per user
- [ ] Auth — username/password login, per-user sessions
- [ ] PWA installability — manifest + service worker shell
- [ ] Lock-screen controls — Media Session API (play/pause/seek minimum)
- [ ] Offline whole-book download — Cache Storage + IndexedDB for audio + metadata

### Add After Validation (v1.x)

- [ ] Optional progress sync to backend — when online, push local position; on resume, fetch server position and merge
- [ ] Per-book speed memory — store speed alongside position in progress record
- [ ] Sleep timer — fixed presets + end-of-chapter
- [ ] Keyboard / media-key bindings on desktop
- [ ] Chapter scrubber with boundary markers

### Future Consideration (v2+)

- [ ] Progress conflict resolution UI — for the edge case where the same user listened offline on two devices
- [ ] Search and filter enhancements (genre, series, narrator) — requires richer metadata extraction
- [ ] Admin library rescan trigger — if the book folder changes

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Resume from last position | HIGH | MEDIUM | P1 |
| Chapter navigation | HIGH | MEDIUM | P1 |
| Playback speed control | HIGH | LOW | P1 |
| Lock-screen controls (Media Session) | HIGH | MEDIUM | P1 |
| Offline whole-book download | HIGH | HIGH | P1 |
| Auth / per-user sessions | HIGH | MEDIUM | P1 |
| Library browse with cover art | HIGH | LOW | P1 |
| +30s / -30s skip | HIGH | LOW | P1 |
| PWA installability | MEDIUM | LOW | P1 |
| Progress sync to backend | MEDIUM | MEDIUM | P2 |
| Per-book speed memory | MEDIUM | LOW | P2 |
| Sleep timer | MEDIUM | MEDIUM | P2 |
| Chapter scrubber UI | MEDIUM | MEDIUM | P2 |
| Keyboard / media-key support | LOW | LOW | P2 |
| Progress conflict resolution UI | LOW | HIGH | P3 |

**Priority key:**
- P1: Must have for launch — missing these = not a real Audible replacement
- P2: Should have — add once core is proven stable
- P3: Nice to have — defer until need is demonstrated

---

## Competitor Feature Analysis

| Feature | Audible | Audiobookshelf | Spine (our approach) |
|---------|---------|----------------|----------------------|
| Library browse | Grid + list, rich metadata | Grid + list, metadata scraping from external | Grid, metadata from .m4b embedded tags only |
| Chapter navigation | Yes | Yes | Yes — from ffprobe extraction |
| Playback speed | 0.5x–3.5x | Yes (range varies by client) | 0.5x–3.0x, per-book memory v1.x |
| +30s / -30s skip | Yes | Yes, configurable | Yes, fixed at 30s for v1 |
| Offline download | Yes (per-book) | Yes (per-book, native app) | Yes — whole-book via PWA Cache Storage |
| Lock-screen controls | Yes (native app) | Yes (native app) | Yes — Media Session API in PWA |
| Progress sync | Cloud, automatic | Server sync via native app | Local-first, optional manual sync |
| Multi-user / household | 1 adult share only | Yes, full multi-user | Yes — core requirement |
| Sleep timer | Yes, fixed presets | Yes | v1.x, end-of-chapter variant |
| Metadata scraping | Automatic | External APIs (Audnexus, Google Books) | None — embedded .m4b metadata only |
| Social / discovery | Limited | None | None by design |
| PWA / web client | Basic web player | Yes (limited offline) | Yes, full offline PWA |
| Format support | Proprietary | mp3, m4b, many more | .m4b only |
| Cost | $15/month subscription | Free, self-hosted | Free, self-hosted |

---

## Sources

- [Audiobookshelf GitHub (advplyr/audiobookshelf)](https://github.com/advplyr/audiobookshelf) — feature set of the leading self-hosted alternative
- [How Does Audible Work 2026 — MakeHeadway](https://makeheadway.com/blog/how-does-audible-work/) — Audible feature baseline
- [Audible Review 2026: A Decade of Stagnation — UseBetterProducts](https://www.usebetterproducts.com/audible-review/) — what's table stakes vs. what's still missing
- [Self-Hosted Audiobooks — Nathan Grigg, March 2025](https://nathangrigg.com/2025/03/self-hosted-audiobooks/) — household use case, motivations
- [MediaSession API — MDN Web Docs](https://developer.mozilla.org/en-US/docs/Web/API/MediaSession) — lock-screen control implementation reference
- [What PWA Can Do Today — whatpwacando.today](https://whatpwacando.today/audio/) — PWA audio capability status
- [Best Audiobook Apps 2026 — BestApp.com](https://www.bestapp.com/best-audiobook-apps/) — industry feature standard

---
*Feature research for: self-hosted audiobook PWA*
*Researched: 2026-03-22*
