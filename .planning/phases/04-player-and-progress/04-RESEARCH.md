# Phase 4: Player and Progress - Research

**Researched:** 2026-03-22
**Domain:** HTML5 Audio API, IndexedDB, Alpine.js store patterns, keyboard/media key events
**Confidence:** HIGH

## Summary

Phase 4 delivers the core listening experience: a persistent bottom-bar audio player with full playback controls, per-user progress tracking in IndexedDB, and keyboard shortcuts. The entire implementation is pure browser APIs — no additional npm packages are needed. The HTML5 `<audio>` element already supports range-request streaming from the existing `/api/books/:id/audio` endpoint, `currentTime` for seeking, and `playbackRate` for speed control. IndexedDB stores progress keyed by `username + bookId` directly in the browser without any server interaction, satisfying the offline-first requirement.

The dominant architectural decision is that `$store.player` becomes the central Alpine.js store containing both the audio element reference and all playback state. The `<audio>` element lives in the persistent player bar HTML and is accessed via a stored reference. All other components (detail view Play button, chapter list rows) call `$store.player` methods. The `timeupdate` event fires 4–66 Hz; auto-save at 15-second intervals is implemented with a setInterval that runs while playing (not on every timeupdate tick), plus a save on every pause event.

The `idb` library (v8, ~1.19kB brotli) is loadable via `<script type="module">` from jsDelivr CDN with no build step — it wraps IndexedDB in a promise-based API. The alternative is using raw IndexedDB directly; given the schema is one object store with simple get/put operations, raw IndexedDB is also viable. Either approach is approximately 20-30 lines of code.

**Primary recommendation:** Use the native HTML5 `<audio>` element as the audio engine, `$store.player` as the Alpine.js global store for all playback state, and either `idb` CDN or raw IndexedDB for progress persistence. No additional npm packages are required.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Player UI layout**
- D-01: Persistent bottom bar visible whenever audio is playing. Stays visible across all views (library grid, book detail). Basic controls always shown: play/pause, book title, progress indicator.
- D-02: Bottom bar is expandable — tap/click to reveal full controls: playback speed selector, sleep timer, chapter list, seek bar. Collapsed bar shows the essentials only.
- D-03: "Go to title" button on the player bar — navigates to the current book's detail view from anywhere (e.g., while browsing library).
- D-04: Tapping a chapter in the detail view starts playback from that chapter immediately.
- D-05: Switching books while audio is playing requires a confirmation prompt ("Switch to [new title]? You'll lose your place in [current title]." — though position is auto-saved, so "lose" means interrupting, not data loss).

**Playback controls**
- D-06: Play/pause toggle button. Skip forward +30s, skip backward -30s buttons.
- D-07: Playback speed via dropdown select. Options: 1.0x, 1.2x, 1.4x, 1.6x, 1.8x, 2.0x. Lives in the expanded player area. Speed preference is remembered locally per book (IndexedDB).
- D-08: Sleep timer control next to playback speed in the expanded player area. Presets: 5, 10, 15, 30, 60 minutes + "End of chapter". Hard stop when timer fires (no fade).
- D-09: Player shows: current chapter title, elapsed time, total duration. Seek bar for scrubbing within the current file.

**Progress persistence**
- D-10: Auto-save position every 15 seconds while playing + on every pause event.
- D-11: Position stored in IndexedDB. Keyed by user ID + book ID. Stores: chapter index, timestamp (seconds), playback speed, last updated date.
- D-12: On book open/resume, restore from IndexedDB — seek to saved chapter and timestamp. If no saved position, start from beginning.
- D-13: Per-user isolation — each household member's progress is independent. User ID comes from `$store.auth` (set at login).

**Keyboard shortcuts (desktop)**
- D-14: Spacebar toggles play/pause. Left arrow seeks back 10s, right arrow seeks forward 10s. Media keys (MediaPlayPause, MediaTrackNext, MediaTrackPrevious) work if available.

### Claude's Discretion
- Exact expanded player layout and animation (slide up, accordion, etc.)
- Seek bar styling and interaction (drag vs click)
- How chapter list displays in expanded player (same as detail view or compact)
- IndexedDB schema details (database name, store name, index structure)
- Confirmation dialog styling for book-switch prompt
- Whether sleep timer shows countdown in the player bar or only in expanded view
- How elapsed/remaining time is formatted during playback

### Deferred Ideas (OUT OF SCOPE)
- Media Session API for lock-screen controls — Phase 5
- Offline audio download and cached playback — Phase 6
- Server-side progress sync — v2 (SYNC-01, SYNC-02, SYNC-03)
- Chapter scrubber with visual boundary markers — v2 (LIBE-03)
- Admin user management UI — future phase
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PLAY-01 | User can play and pause audio in the browser | `<audio>` element `.play()` / `.pause()` methods; `paused` property for toggle logic |
| PLAY-02 | User can skip forward and backward 30 seconds | `audio.currentTime += 30` / `audio.currentTime -= 30`; clamp to [0, duration] |
| PLAY-03 | User can adjust playback speed from 1.0x to 2.0x in 0.2x intervals | `audio.playbackRate = value`; dropdown with 6 values; persisted per book in IndexedDB |
| PLAY-04 | User can view chapter list and jump to any chapter | Chapters in `$store.library.selectedBook.chapters`; click sets `audio.currentTime = chapter.start_sec` |
| PLAY-05 | Player shows current chapter title, elapsed time, and total duration | `timeupdate` event drives reactive display; chapter title derived by finding which chapter contains `currentTime` |
| PLAY-06 | User's per-book playback speed preference is remembered across sessions | IndexedDB record stores `speed` field per `username + bookId` key |
| PLAY-07 | User can set a sleep timer (5, 10, 15, 30, 60 min presets + end of chapter) | `setTimeout` for minute-based presets; chapter end detection via `timeupdate` comparing `currentTime` to `chapter.end_sec` |
| PLAY-08 | Keyboard shortcuts work on desktop (spacebar pause, arrow seek, media keys) | `document.addEventListener('keydown', ...)` with `e.preventDefault()` to block scroll; MediaSession `setActionHandler` for media keys |
| PROG-01 | User's playback position is saved per book (chapter + timestamp) | IndexedDB `put` on pause + every 15s via setInterval |
| PROG-02 | Position is stored locally in IndexedDB (works offline) | IndexedDB is local-only browser storage; no network required |
| PROG-03 | User resumes from last saved position when reopening a book | On `$store.player.play(book)`: read IndexedDB record, then `audio.currentTime = saved.timestamp` after `canplay` fires |
| PROG-04 | Progress is isolated per user — each household member has their own position | IndexedDB key = `${username}::${bookId}`; username from `$store.auth.username` |
</phase_requirements>

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| HTML5 `<audio>` element | Browser built-in | Audio engine | Native streaming of MP4/M4B with range request support; `currentTime`, `playbackRate`, `duration`, `timeupdate` — no library needed |
| Alpine.js | 3.15.8 (CDN, already loaded) | Player store and reactive UI | Already in project; `Alpine.store('player', {...})` pattern established in Phase 3 |
| IndexedDB (raw or via `idb`) | Browser built-in / idb v8 | Progress persistence | Local-only, offline-capable, structured storage per browser spec |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `idb` | 8.x via CDN | Promise-based IndexedDB wrapper | Reduces IndexedDB boilerplate from ~80 lines to ~15 lines. Use if the schema has multiple stores or complex queries. For a single-store schema (just progress records), raw IndexedDB is also acceptable. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Raw IndexedDB | `idb` CDN | `idb` is cleaner, but adds a CDN dependency. Raw IndexedDB needs one openDB helper (~25 lines) and is entirely self-contained. |
| `idb` CDN | localStorage | localStorage is synchronous, limited to 5-10MB, and stores strings only. IndexedDB is the correct choice for structured per-user data. |
| setInterval for auto-save | `timeupdate` event throttled | `timeupdate` fires 4–66 Hz; throttling inside it is fragile. setInterval every 15s triggered on play/cleared on pause is simpler and more predictable. |

**Installation (frontend — CDN only, no build step):**
```html
<!-- If using idb wrapper (optional) -->
<script type="module">
  import { openDB } from 'https://cdn.jsdelivr.net/npm/idb@8/+esm'
  // must store the db reference somewhere accessible, e.g. window._spineDB
</script>

<!-- OR: raw IndexedDB, no external dependency -->
```

**Note on `idb` with Alpine.js stores:** Because Alpine stores use `alpine:init` with a plain `<script>` tag (not `type="module"`), the `idb` import must be done separately in a `<script type="module">` block and exposed via `window._spineDB` or a similar bridge. Raw IndexedDB avoids this awkwardness entirely and is recommended for this project.

---

## Architecture Patterns

### Recommended Project Structure (additions to public/)

```
public/
├── index.html          # Add: <audio> element, player bar HTML, $store.player store, keyboard listeners
├── style.css           # Add: player bar styles, seek bar, expanded panel, sleep timer display
└── sw.js               # No changes needed for Phase 4 (offline is Phase 6)
```

No new files needed. All Phase 4 code lives in `index.html` (store + HTML) and `style.css` (styles).

### Pattern 1: `$store.player` Alpine Store

**What:** Central store holding all playback state and methods. The `<audio>` DOM element reference is stored on the store object itself after Alpine initializes it.

**When to use:** Any time player state needs to be read or mutated from anywhere in the app.

**Example:**
```javascript
// Source: Alpine.js store pattern (alpinejs.dev/essentials/state)
document.addEventListener('alpine:init', () => {
  Alpine.store('player', {
    // State
    audioEl: null,           // Set in x-init of player bar element
    book: null,              // Currently loaded book object
    playing: false,
    currentTime: 0,
    duration: 0,
    speed: 1.0,
    currentChapterIdx: 0,
    expanded: false,
    sleepTimer: null,        // setTimeout handle
    sleepMode: null,         // 'chapter' | number (minutes)
    saveInterval: null,      // setInterval handle

    // Computed
    get currentChapter() {
      if (!this.book || !this.book.chapters) return null
      return this.book.chapters[this.currentChapterIdx] || null
    },

    // Initialize audio element reference (called from player bar x-init)
    init(audioEl) {
      this.audioEl = audioEl
      audioEl.addEventListener('timeupdate', () => this._onTimeUpdate())
      audioEl.addEventListener('pause', () => this._onPause())
      audioEl.addEventListener('ended', () => this._onEnded())
      audioEl.addEventListener('loadedmetadata', () => {
        this.duration = audioEl.duration
      })
    },

    // Start playing a book (called from detail view Play button)
    async play(book) {
      if (this.book && this.book.id !== book.id && this.playing) {
        // Book-switch confirmation handled in UI
      }
      this.book = book
      this.audioEl.src = '/api/books/' + book.id + '/audio'
      // Restore saved position
      const saved = await progressDB.get(Alpine.store('auth').username, book.id)
      this.audioEl.addEventListener('canplay', () => {
        if (saved) {
          this.audioEl.currentTime = saved.timestamp
          this.currentChapterIdx = saved.chapterIdx
        }
        this.audioEl.playbackRate = saved ? saved.speed : 1.0
        this.speed = this.audioEl.playbackRate
        this.audioEl.play()
        this.playing = true
        this._startSaveInterval()
      }, { once: true })
      this.audioEl.load()
    },

    togglePlay() {
      if (this.playing) {
        this.audioEl.pause()
      } else {
        this.audioEl.play()
        this.playing = true
        this._startSaveInterval()
      }
    },

    skip(seconds) {
      if (!this.audioEl) return
      this.audioEl.currentTime = Math.max(0, Math.min(
        this.audioEl.currentTime + seconds,
        this.audioEl.duration
      ))
    },

    setSpeed(speed) {
      this.speed = speed
      if (this.audioEl) this.audioEl.playbackRate = speed
      // Persist speed preference
      if (this.book) {
        progressDB.save(Alpine.store('auth').username, this.book.id, {
          timestamp: this.currentTime,
          chapterIdx: this.currentChapterIdx,
          speed: this.speed
        })
      }
    },

    jumpToChapter(chapterIdx) {
      const ch = this.book.chapters[chapterIdx]
      if (!ch) return
      this.currentChapterIdx = chapterIdx
      this.audioEl.currentTime = ch.start_sec
      if (!this.playing) {
        this.audioEl.play()
        this.playing = true
        this._startSaveInterval()
      }
    },

    setSleepTimer(mode) {
      this._clearSleepTimer()
      this.sleepMode = mode
      if (typeof mode === 'number') {
        this.sleepTimer = setTimeout(() => this._sleepStop(), mode * 60 * 1000)
      }
      // 'chapter' mode: detected in _onTimeUpdate
    },

    _onTimeUpdate() {
      this.currentTime = this.audioEl.currentTime
      // Update current chapter index
      if (this.book && this.book.chapters) {
        const idx = this.book.chapters.findIndex((ch, i) => {
          const next = this.book.chapters[i + 1]
          return this.currentTime >= ch.start_sec && (!next || this.currentTime < next.start_sec)
        })
        if (idx >= 0 && idx !== this.currentChapterIdx) {
          this.currentChapterIdx = idx
        }
        // End-of-chapter sleep timer
        if (this.sleepMode === 'chapter') {
          const ch = this.book.chapters[this.currentChapterIdx]
          if (ch && this.currentTime >= ch.end_sec - 0.5) {
            this._sleepStop()
          }
        }
      }
    },

    _onPause() {
      this.playing = false
      this._clearSaveInterval()
      this._saveProgress()
    },

    _onEnded() {
      this.playing = false
      this._clearSaveInterval()
      this._saveProgress()
    },

    async _saveProgress() {
      if (!this.book) return
      await progressDB.save(Alpine.store('auth').username, this.book.id, {
        timestamp: this.currentTime,
        chapterIdx: this.currentChapterIdx,
        speed: this.speed,
        updatedAt: Date.now()
      })
    },

    _startSaveInterval() {
      this._clearSaveInterval()
      this.saveInterval = setInterval(() => {
        if (this.playing) this._saveProgress()
      }, 15000)
    },

    _clearSaveInterval() {
      if (this.saveInterval) { clearInterval(this.saveInterval); this.saveInterval = null }
    },

    _sleepStop() {
      this.audioEl.pause()
      this._clearSleepTimer()
      this.sleepMode = null
    },

    _clearSleepTimer() {
      if (this.sleepTimer) { clearTimeout(this.sleepTimer); this.sleepTimer = null }
    }
  })
})
```

### Pattern 2: IndexedDB Progress Store (raw, no library)

**What:** A module-style object (plain JS, not Alpine) wrapping the three IndexedDB operations needed.

**When to use:** Progress save/restore operations from within `$store.player` methods.

**Example:**
```javascript
// Source: MDN IndexedDB API (developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API)
const progressDB = (() => {
  const DB_NAME = 'spine-progress'
  const DB_VERSION = 1
  const STORE = 'progress'
  let _db = null

  async function open() {
    if (_db) return _db
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION)
      req.onupgradeneeded = (e) => {
        const db = e.target.result
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE)   // key = username::bookId passed externally
        }
      }
      req.onsuccess = (e) => { _db = e.target.result; resolve(_db) }
      req.onerror = (e) => reject(e.target.error)
    })
  }

  function key(username, bookId) { return `${username}::${bookId}` }

  return {
    async get(username, bookId) {
      const db = await open()
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readonly')
        const req = tx.objectStore(STORE).get(key(username, bookId))
        req.onsuccess = () => resolve(req.result || null)
        req.onerror = () => reject(req.error)
      })
    },
    async save(username, bookId, data) {
      const db = await open()
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite')
        const req = tx.objectStore(STORE).put(data, key(username, bookId))
        req.onsuccess = () => resolve()
        req.onerror = () => reject(req.error)
      })
    }
  }
})()
```

### Pattern 3: Player Bar HTML Structure

**What:** Persistent `<div>` at the bottom of the page, always in the DOM, shown via `x-show` when a book is loaded.

**When to use:** The bottom bar must persist across view changes (library, detail). Alpine `x-show` preserves the `<audio>` element and its state between views.

**Example:**
```html
<!-- OUTSIDE the x-show view containers, directly inside session-check wrapper -->
<!-- Source: Alpine.js x-show directive (alpinejs.dev/directives/show) -->
<div class="player-bar" x-show="$store.player.book" x-init="$store.player.init($refs.audio)">
  <audio x-ref="audio" preload="auto"></audio>

  <!-- Collapsed bar (always visible when playing) -->
  <div class="player-collapsed">
    <button @click="$store.player.togglePlay()">
      <!-- play/pause SVG icon toggled by $store.player.playing -->
    </button>
    <div class="player-book-info">
      <span x-text="$store.player.book?.title"></span>
      <span x-text="$store.player.currentChapter?.title"></span>
    </div>
    <span x-text="formatTime($store.player.currentTime)"></span>
    <button @click="$store.player.expanded = !$store.player.expanded">...</button>
  </div>

  <!-- Expanded panel (shown on tap/click) -->
  <div class="player-expanded" x-show="$store.player.expanded">
    <!-- seek bar, speed selector, sleep timer, chapter list -->
  </div>
</div>
```

**Key constraint:** `x-init` on the player bar div fires once when the element is first rendered. The `$refs.audio` is accessible at that moment and stored on the store. This is the established Alpine pattern for bridging refs to stores.

### Pattern 4: Keyboard Shortcuts

**What:** `document.addEventListener('keydown', ...)` registered once after Alpine init. Guards against firing when a form input is focused.

**When to use:** Spacebar, arrow keys, and media keys per D-14.

**Example:**
```javascript
// Source: MDN KeyboardEvent (developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent)
document.addEventListener('keydown', (e) => {
  // Don't intercept when typing in an input
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return
  const player = Alpine.store('player')
  if (!player.book) return

  if (e.code === 'Space') {
    e.preventDefault()   // prevent page scroll
    player.togglePlay()
  } else if (e.code === 'ArrowLeft') {
    e.preventDefault()
    player.skip(-10)
  } else if (e.code === 'ArrowRight') {
    e.preventDefault()
    player.skip(10)
  }
})

// Media keys via MediaSession (where supported — Phase 4 only needs play/pause)
if ('mediaSession' in navigator) {
  navigator.mediaSession.setActionHandler('play', () => Alpine.store('player').togglePlay())
  navigator.mediaSession.setActionHandler('pause', () => Alpine.store('player').togglePlay())
}
```

### Anti-Patterns to Avoid

- **Storing `<audio>` element in Alpine reactive data (`x-data` or store as plain property):** Alpine will try to proxy the HTMLMediaElement and fail. Store the ref as a non-reactive property (set after init, not declared in the store's initial object definition with a value) — or simply assign it directly: `this.audioEl = el` where `el` is the raw DOM element.
- **Listening to `timeupdate` for auto-save:** Fires up to 66 Hz; writing IndexedDB on every tick causes I/O thrash. Use setInterval(fn, 15000) instead.
- **Setting `audio.src` then immediately seeking:** The audio is not loaded yet. Seek only after the `canplay` event fires, using `{ once: true }` listener.
- **Using Arrow keys globally without `e.preventDefault()`:** ArrowLeft/ArrowRight scroll the page when a scrollable element is in view. Always preventDefault for keys you handle.
- **Spacebar on inputs:** The keydown guard (`if (e.target.tagName === 'INPUT') return`) prevents the play/pause toggle from firing when a user types in the search box.
- **Chapter index drift:** Chapter index must be computed from `currentTime` during `timeupdate` (not just tracked on `jumpToChapter`) because the user can seek manually via the seek bar, advancing past chapter boundaries without calling `jumpToChapter`.
- **`idb` in a non-module `<script>` tag:** `idb` v8 is ESM-only. It cannot be loaded with a plain `<script src>` tag. Either use `<script type="module">` or use raw IndexedDB. The project's existing Alpine store is registered in a plain `<script>` (not module), so mixing is awkward. Prefer raw IndexedDB.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Audio streaming with seek | Custom byte-range fetch + Web Audio API | HTML5 `<audio>` element with `src` | Browser handles all HTTP range requests, buffering, decoding, and seeking natively |
| Audio format detection | MIME-type sniffing | `<audio>` + M4B served as `audio/mp4` | M4B is MP4 container; all target browsers support it natively |
| IndexedDB schema migration | Manual version tracking | `onupgradeneeded` callback (IDB spec) | The spec provides structured version upgrades; implement it directly |
| Keyboard shortcut library | Custom key map manager | Direct `document.addEventListener('keydown', ...)` | Only 3 keys needed (Space, Left, Right); a library adds zero value |

**Key insight:** The browser already does the hard parts. The `<audio>` element is a complete audio player engine — streaming, buffering, seeking, and decoding are all handled natively. Phase 4's job is wiring up UI to the already-functional engine.

---

## Common Pitfalls

### Pitfall 1: Alpine Reactive Proxy of HTMLMediaElement

**What goes wrong:** If `audioEl` is declared in the Alpine store's initial object as `audioEl: null` and then assigned with `this.audioEl = el`, Alpine wraps the assignment in a Proxy. HTMLMediaElement cannot be proxied — it throws or silently breaks.

**Why it happens:** Alpine 3.x makes all store properties reactive (Proxy-wrapped). DOM elements cannot be proxied.

**How to avoid:** After `init(el)` is called, assign using `Object.defineProperty(this, 'audioEl', { value: el, writable: true })` or use a closure variable outside the store object, or use a WeakMap keyed on the store. Alternatively, store it on `window._spineAudio = el` and access it directly from store methods.

**Warning signs:** `audioEl.play is not a function`, or `Cannot set property 'currentTime' of undefined`.

### Pitfall 2: Seeking Before Audio is Ready

**What goes wrong:** Setting `audio.currentTime = savedPosition` immediately after setting `audio.src` does nothing. The seek is silently ignored because no audio data is loaded yet.

**Why it happens:** Setting `src` clears the media element's state. `currentTime` can only be set when `readyState >= HAVE_METADATA`.

**How to avoid:** Listen for `canplay` (or `loadedmetadata` for metadata-only needs) with `{ once: true }` before seeking. Always: set `src`, call `load()`, then in the `canplay` handler: set `currentTime`, then call `play()`.

**Warning signs:** Book always starts from 0:00 regardless of saved position.

### Pitfall 3: Auto-Save Race on Logout

**What goes wrong:** User logs out while audio is playing. The 15-second save interval fires during logout cleanup, writing progress under a username that's now `''`.

**Why it happens:** `clearInterval` is called in `_onPause()`, but if the user navigates away without pausing, the interval is still alive.

**How to avoid:** Call `$store.player._clearSaveInterval()` and `audioEl.pause()` in the logout handler (already in `index.html`'s nav-logout button). Pause fires `_onPause()` which clears the interval and saves progress with the correct username before `$store.auth.username` is cleared.

### Pitfall 4: Spacebar Fires on Form Inputs

**What goes wrong:** User types in the search box. Spacebar triggers play/pause instead of inserting a space.

**Why it happens:** `document.addEventListener('keydown', ...)` captures all keydown events including those inside inputs.

**How to avoid:** Guard at the top of the keydown handler: `if (['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return`.

### Pitfall 5: End-of-Chapter Sleep Timer with Short Chapters

**What goes wrong:** The `timeupdate` event fires up to 4 Hz minimum. If a chapter is very short (< 250ms), `timeupdate` may never fire while `currentTime` is in that chapter, and the sleep timer check in `_onTimeUpdate` might fire on the next chapter instead.

**Why it happens:** `timeupdate` event frequency is browser-controlled and non-deterministic.

**How to avoid:** Check `currentTime >= ch.end_sec - 0.5` (500ms buffer) rather than an exact equality. This gives a 500ms window for the event to fire. For the specific "end of chapter" stop, this 500ms early stop is acceptable behavior for an audiobook app.

### Pitfall 6: Progress Key Collision Across Environments

**What goes wrong:** Two instances of Spine (e.g., dev + prod) share the same browser IndexedDB database name (`spine-progress`), so dev testing overwrites prod progress.

**Why it happens:** IndexedDB is scoped per origin (protocol + host + port). If both run on `localhost`, they share the database.

**How to avoid:** For development, use a different port than production. In production Docker this is not an issue since the app runs on its own host. Document this for developers.

### Pitfall 7: Alpine Reactivity and `currentTime` Update Frequency

**What goes wrong:** Updating `$store.player.currentTime` inside `timeupdate` (4–66 Hz) causes Alpine to re-render the player bar DOM on every tick, making the UI jank or consuming CPU.

**Why it happens:** Alpine's reactivity triggers a re-render for any store property change.

**How to avoid:** Throttle the reactive update. Only update `this.currentTime` every N ticks, or use a non-reactive property for the raw current time and update the reactive one less frequently (e.g., every second). Alternatively, update `currentTime` on every `timeupdate` but keep the player bar HTML minimal — Alpine's reactive updates are fast enough if the DOM is small. Monitor in practice; for a simple progress bar this is likely fine.

---

## Code Examples

Verified patterns from official sources:

### Setting Seek Position After Load
```javascript
// Source: MDN HTMLMediaElement (developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/currentTime)
audio.addEventListener('canplay', () => {
  audio.currentTime = 3600  // seek to 1 hour in
  audio.play()
}, { once: true })
audio.src = '/api/books/42/audio'
audio.load()
```

### Playback Rate Change
```javascript
// Source: MDN HTMLMediaElement.playbackRate (developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/playbackRate)
audio.playbackRate = 1.5    // 1.5x speed
audio.preservesPitch = true // keep pitch stable (default true in most browsers)
```

### Current Chapter Detection
```javascript
// Source: pattern derived from chapters array structure (GET /api/books/:id returns chapters[].start_sec)
function getCurrentChapterIdx(chapters, currentTime) {
  for (let i = chapters.length - 1; i >= 0; i--) {
    if (currentTime >= chapters[i].start_sec) return i
  }
  return 0
}
```

### IndexedDB Open + Get + Put (raw, no idb library)
```javascript
// Source: MDN Using IndexedDB (developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API/Using_IndexedDB)
const req = indexedDB.open('spine-progress', 1)
req.onupgradeneeded = (e) => {
  e.target.result.createObjectStore('progress')
}
req.onsuccess = (e) => {
  const db = e.target.result
  // PUT
  db.transaction('progress', 'readwrite').objectStore('progress').put(data, 'user::bookId')
  // GET
  const r = db.transaction('progress').objectStore('progress').get('user::bookId')
  r.onsuccess = () => console.log(r.result)
}
```

### Keyboard Handler with Input Guard
```javascript
// Source: MDN KeyboardEvent.code (developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/code)
document.addEventListener('keydown', (e) => {
  if (['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return
  const player = Alpine.store('player')
  if (!player.book) return
  switch (e.code) {
    case 'Space':      e.preventDefault(); player.togglePlay(); break
    case 'ArrowLeft':  e.preventDefault(); player.skip(-10); break
    case 'ArrowRight': e.preventDefault(); player.skip(10); break
  }
})
```

### Media Key Handler
```javascript
// Source: MDN MediaSession (developer.mozilla.org/en-US/docs/Web/API/MediaSession)
if ('mediaSession' in navigator) {
  navigator.mediaSession.setActionHandler('play',  () => Alpine.store('player').togglePlay())
  navigator.mediaSession.setActionHandler('pause', () => Alpine.store('player').togglePlay())
}
// Note: MediaTrackNext and MediaTrackPrevious for chapter navigation — Phase 5 (locked out of Phase 4)
```

### Seek Bar Input Handler
```javascript
// Source: HTML input[type=range] interaction pattern
// input event fires while dragging; change fires on release
seekInput.addEventListener('input', (e) => {
  // Show preview time without actually seeking (optional)
})
seekInput.addEventListener('change', (e) => {
  Alpine.store('player').audioEl.currentTime = parseFloat(e.target.value)
})
```

### Sleep Timer — Minute Preset
```javascript
// Source: standard setTimeout pattern
setSleepTimer(minutes) {
  this._clearSleepTimer()
  this.sleepMode = minutes
  this.sleepTimerEndsAt = Date.now() + minutes * 60 * 1000
  this.sleepTimer = setTimeout(() => {
    this.audioEl.pause()   // triggers _onPause which saves progress
    this.sleepMode = null
  }, minutes * 60 * 1000)
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Web Audio API for playback control | HTML5 `<audio>` element + native streaming | 2015–present | `<audio>` handles all streaming, buffering, seeking natively; Web Audio API is for synthesis/effects |
| Cookies/localStorage for progress | IndexedDB | 2012–present; now standard | localStorage limited to 5MB strings; IndexedDB handles structured data per origin |
| `fluent-ffmpeg` for metadata | Direct `child_process.spawn` to ffprobe | May 2025 (archived) | Already handled in Phase 1; no change for Phase 4 |
| Custom seek via XHR + Web Audio | Native `<audio>` seek via `currentTime` | N/A for this project | Range requests already implemented in Phase 2 |

**Deprecated/outdated for this phase:**
- Web Audio API `AudioContext` + `AudioBufferSourceNode` for audiobooks: overkill, no seek support without custom implementation. Use `<audio>` element.
- `createObjectURL` + Blob for audio: unnecessary since the server serves the audio with range support.

---

## Open Questions

1. **Alpine reactive proxy of `audioEl`**
   - What we know: Alpine proxies all store properties; HTMLMediaElement cannot be proxied
   - What's unclear: Whether `this.audioEl = el` in a store method (as opposed to in the initial object declaration) triggers the proxy. Alpine may only proxy properties declared in the initial store definition.
   - Recommendation: Test immediately in Wave 0 with a minimal `Alpine.store` + `<audio x-ref>`. If it breaks, use `window._spineAudio` as a safe side channel or `Object.defineProperty` with a non-enumerable property.

2. **`canplay` vs `loadedmetadata` for reliable seek**
   - What we know: `loadedmetadata` fires when duration is known; `canplay` fires when playback can start
   - What's unclear: For remote audio with range requests, which fires first and whether seeking works at each stage
   - Recommendation: Use `canplay` as the primary gate for seek + play. If issues arise, try `loadedmetadata` for seek-only (to restore position for display) and `canplay` for play.

3. **Seek bar drag on mobile**
   - What we know: `input[type=range]` is the standard seek bar implementation; works on touch devices
   - What's unclear: Whether touch drag on the range input feels smooth enough or needs a custom touch handler on mobile Chrome
   - Recommendation: Use native `input[type=range]` first. Add custom touch handling only if user testing shows problems.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Bun test (built-in) |
| Config file | none — `bun test` auto-discovers `*.test.ts` files |
| Quick run command | `bun test --test-name-pattern player` |
| Full suite command | `bun test` |

### Phase Requirements → Test Map

Phase 4 is entirely frontend (browser APIs). Backend has no new routes. Testing strategy is:

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PLAY-01 | play/pause toggle | manual smoke | n/a — browser-only | N/A |
| PLAY-02 | skip +30/-30 | unit (logic) | `bun test --test-name-pattern skip` | ❌ Wave 0 |
| PLAY-03 | speed 1.0–2.0 options | manual smoke | n/a — browser-only | N/A |
| PLAY-04 | chapter jump via click | manual smoke | n/a — browser-only | N/A |
| PLAY-05 | chapter title + elapsed display | unit (getCurrentChapterIdx) | `bun test --test-name-pattern chapter` | ❌ Wave 0 |
| PLAY-06 | speed persisted per book | unit (progressDB.save/get) | `bun test --test-name-pattern progressDB` | ❌ Wave 0 |
| PLAY-07 | sleep timer fires at correct time | unit (timer logic) | `bun test --test-name-pattern sleep` | ❌ Wave 0 |
| PLAY-08 | keyboard shortcuts | manual smoke | n/a — requires DOM | N/A |
| PROG-01 | position saved on pause + every 15s | unit (save interval logic) | `bun test --test-name-pattern autosave` | ❌ Wave 0 |
| PROG-02 | IndexedDB local-only | manual smoke | n/a — browser-only | N/A |
| PROG-03 | resumes from saved position | manual smoke | n/a — browser-only | N/A |
| PROG-04 | progress isolated per user | unit (progressDB key format) | `bun test --test-name-pattern progressDB` | ❌ Wave 0 |

**Note:** The majority of Phase 4 is frontend-only browser code (HTMLMediaElement, IndexedDB, DOM events). Bun test runs in Node/Bun, not a browser. Automated tests can cover:
- The `getCurrentChapterIdx()` pure function (takes chapters array + currentTime, returns index)
- The IndexedDB key format (`${username}::${bookId}`)
- Sleep timer arithmetic (minutes to milliseconds)
- Skip logic (clamp to [0, duration])

All other behavior requires browser integration testing (manual smoke tests).

### Sampling Rate
- **Per task commit:** `bun test` (full suite runs in < 2s; all tests are fast unit tests)
- **Per wave merge:** `bun test` + manual browser smoke: play/pause, chapter jump, speed change, keyboard shortcuts
- **Phase gate:** Full suite green + manual smoke checklist passed before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/player.test.ts` — covers getCurrentChapterIdx, skip clamp, progressDB key format, sleep timer arithmetic
- No framework install needed — `bun test` is built-in

---

## Sources

### Primary (HIGH confidence)
- [MDN HTMLMediaElement](https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement) — currentTime, playbackRate, duration, timeupdate, canplay, pause, ended events; Baseline Widely Available since July 2015
- [MDN IndexedDB API / Using IndexedDB](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API/Using_IndexedDB) — openDB, createObjectStore, transaction, get, put patterns
- [MDN MediaSession](https://developer.mozilla.org/en-US/docs/Web/API/MediaSession) — setActionHandler API; flagged as limited availability (not Baseline); Phase 4 uses only play/pause handlers
- [Alpine.js — State](https://alpinejs.dev/essentials/state) — Alpine.store() registration pattern; x-ref usage; init timing

### Secondary (MEDIUM confidence)
- [jakearchibald/idb GitHub](https://github.com/jakearchibald/idb) — idb v8, ~1.19kB brotli, ESM-only; `openDB` API confirmed; jsDelivr CDN ESM import confirmed
- [jsDelivr idb package page](https://www.jsdelivr.com/package/npm/idb) — CDN URL pattern: `https://cdn.jsdelivr.net/npm/idb@8/+esm`
- MDN timeupdate event — fires 4–66 Hz depending on system load; not suitable for high-frequency I/O like IndexedDB writes
- Existing project code — `public/index.html` Phase 3 output: store registration pattern, Alpine.store('auth').username availability, chapters array structure from `/api/books/:id`

### Tertiary (LOW confidence)
- WebSearch: Alpine.js proxy behavior with DOM elements — no official documentation found; based on community reports and known Proxy limitations with native objects

---

## Metadata

**Confidence breakdown:**
- Standard stack (HTML5 audio + raw IndexedDB): HIGH — browser built-ins, MDN documented, Baseline
- Architecture (Alpine store pattern): HIGH — follows established Phase 3 pattern exactly
- IndexedDB key/schema design: HIGH — trivial schema, well-documented API
- Pitfalls (audio readyState, Alpine proxy): MEDIUM — audio timing pitfall is well-known; Alpine proxy behavior with DOM elements is empirically reported but not officially documented
- Keyboard/media keys: HIGH — MDN documented, standard browser API

**Research date:** 2026-03-22
**Valid until:** 2026-09-22 (stable browser APIs; Alpine 3.x is stable)
