# Pitfalls Research

**Domain:** Self-hosted audiobook PWA (.m4b streaming, offline, Media Session API)
**Researched:** 2026-03-22
**Confidence:** HIGH (range requests, service worker caching, Media Session API — all verified against official Workbox docs, web.dev, MDN); MEDIUM (iOS limitations, m4b edge cases — verified against multiple sources); LOW (Alpine.js specific patterns — minimal domain-specific sources found)

---

## Critical Pitfalls

### Pitfall 1: Service Worker Cannot Serve Audio Range Requests Without Explicit Plugin

**What goes wrong:**
The browser's `<audio>` element uses HTTP range requests to seek and scrub through audio. When a service worker intercepts these requests using a standard cache-first strategy, it returns a full 200 response instead of a 206 Partial Content response with proper `Content-Range` headers. The browser sees no 206 and loses the ability to seek — the scrubber freezes or breaks entirely. This is worse on Safari, which makes an initial `bytes=0-1` probe to detect range support before playback even begins; if that probe fails, Safari refuses to play the cached file at all.

**Why it happens:**
Workbox's default caching strategies (CacheFirst, NetworkFirst, etc.) do not handle range request headers. Developers add audio caching without reading the Workbox media documentation and assume a CacheFirst strategy "just works" for audio. Everything works fine in the browser's network tab (the full file was cached), but seeking is silently broken.

**How to avoid:**
Always attach the `workbox-range-requests` plugin (`RangeRequestsPlugin`) to any Workbox strategy that handles audio or video URLs. This plugin intercepts the cached full response and returns the correct byte slice with a 206 status. Additionally, add `crossorigin` attribute to `<audio>` elements even for same-origin URLs — Workbox requires it for media caching to function correctly.

```js
// Required pattern for cached audio
import { CacheFirst } from 'workbox-strategies';
import { RangeRequestsPlugin } from 'workbox-range-requests';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';

registerRoute(
  ({ url }) => url.pathname.startsWith('/api/stream/'),
  new CacheFirst({
    cacheName: 'audiobooks',
    plugins: [
      new CacheableResponsePlugin({ statuses: [200] }),
      new RangeRequestsPlugin(),
    ],
  })
);
```

**Warning signs:**
- Audio plays from beginning but seeking jumps to wrong position or hangs
- Seeking works when online (streaming directly) but breaks when offline (from cache)
- Safari refuses to play cached audio even though Chrome works
- DevTools shows 200 responses for audio requests served from cache

**Phase to address:** Audio streaming phase (backend + service worker setup). Must be verified before any offline testing. Do not test offline playback without first confirming seek works with a cached file.

---

### Pitfall 2: Streaming Audio Without `Accept-Ranges` Makes Seeking Impossible

**What goes wrong:**
The backend serves audio but omits the `Accept-Ranges: bytes` response header. Browsers won't attempt range requests without this header, falling back to downloading the entire file before playing. The audio element's time slider becomes non-functional until the full file is buffered. For a 500MB .m4b, this is unusable.

**Why it happens:**
Standard Node.js `res.sendFile()` or naive stream implementations don't automatically implement range request support. Developers test audio playback (it starts playing) but don't verify that seeking works, discovering the problem much later.

**How to avoid:**
The audio streaming endpoint must:
1. Read the `Range: bytes=X-Y` header from the request
2. Open the file, stat it, and calculate the byte range
3. Respond with HTTP 206, `Content-Range: bytes X-Y/Total`, `Accept-Ranges: bytes`, `Content-Length: rangeSize`
4. Stream only the requested byte slice using `fs.createReadStream(path, { start, end })`

Do not use `res.sendFile()` for audio streaming — it doesn't implement range support correctly. Implement it manually or use a library that handles it.

**Warning signs:**
- Seeking to the middle of a book causes a long delay then jumps to the right position
- DevTools Network tab shows `200 OK` instead of `206 Partial Content` for audio requests
- The audio element's buffered range always starts at 0 and grows linearly
- Mobile devices play the full file but can't seek backward

**Phase to address:** Backend API phase (audio streaming endpoint). This is the most fundamental streaming requirement and must be correct before building any player UI.

---

### Pitfall 3: Caching Large Audio Files During Runtime Streaming Is Impossible

**What goes wrong:**
Developers assume a service worker runtime cache will transparently cache the audio file as the user streams it. It will not. Browsers only request byte ranges during streaming — a 500MB file gets fetched as dozens of small range requests, none of which is a complete 200 response. The cache stores partial chunks, not the full file. When the user goes offline, the "cached" audio is unusable.

**Why it happens:**
Service worker caching documentation often shows runtime caching (intercept network requests, store responses). Developers apply this to audio assuming it accumulates a full cache. The Workbox documentation explicitly warns against this but it is easy to miss.

**How to avoid:**
Offline audiobook download must be an explicit, user-triggered action that fetches the complete file using `fetch()` (not `<audio>`), stores it via `cache.add()` or `cache.put()` with a single full 200 response. The UI must have a distinct "Download for offline" button and progress indicator. The offline-capable audio player then uses the cached full file (served via `RangeRequestsPlugin`) rather than the streaming endpoint.

**Warning signs:**
- Offline audio "should work" but never does
- Cache Storage shows entries for the audio URL but they are small (bytes not megabytes)
- No explicit download mechanism exists in the UI — "it's cached automatically"

**Phase to address:** Offline download phase. Separate this feature from streaming entirely — they are different code paths with different storage models.

---

### Pitfall 4: iOS Safari Breaks Audio PWAs at the System Level

**What goes wrong:**
On iOS, PWA audio playback stops completely when the app is minimized or the screen locks. Media Session API lock-screen controls appear intermittently, lose state, or stop responding. There is no reliable way to continue audio playback while the phone is in the pocket. This is a fundamental iOS/Safari architectural limitation, not a bug with a workaround.

**Why it happens:**
Apple does not grant PWAs the same background audio privileges as native apps. Safari's WKWebView (used for both in-browser and home-screen PWA contexts on iOS) enforces strict foreground-only audio restrictions. Developer experience reports from multiple teams confirm this has not meaningfully improved through iOS 17+.

**How to avoid:**
Set iOS expectations explicitly in planning:
- Declare iOS as a "best effort" platform for audio playback
- Target Android Chrome as the primary mobile platform (full Media Session API support, background audio works correctly)
- Test all audio features on Android first
- Do not architect around iOS-specific workarounds that will break cross-platform

Do not file this as a bug to fix — it is a platform policy decision.

**Warning signs:**
- iOS-specific workaround code proliferating in the audio player
- Testing primarily done on iOS before Android validation
- Promises made about iOS lock-screen controls as a core feature

**Phase to address:** Player UI phase. Document iOS limitations in the project's known constraints before the phase begins. Verify Android lock-screen controls work before spending any time on iOS investigation.

---

### Pitfall 5: Media Session API Position State Not Updated — Lock Screen Controls Desynced

**What goes wrong:**
The Android lock screen shows playback controls but they report the wrong position, don't update as time passes, or the seek bar is frozen or invisible. Tapping "skip back 30s" on the lock screen does nothing, or jumps to the wrong position.

**Why it happens:**
The Media Session API requires developers to manually push position state updates via `navigator.mediaSession.setPositionState()`. The API does not listen to the `<audio>` element's `timeupdate` events automatically. Developers implement `setActionHandler` correctly but forget to call `setPositionState` — the controls appear but are not synchronized to actual playback.

Additional pitfall: after handling a `seekto`, `seekbackward`, or `seekforward` action, developers must call `setPositionState` again with the new position. Missing this call leaves the lock screen display frozen at the pre-seek position.

The API also requires `duration` to be positive and explicitly set before position state will be displayed. If duration is NaN (audio not yet loaded), the lock screen may show no scrubber.

**How to avoid:**
Wire `setPositionState()` to the `<audio>` element's `timeupdate` event, throttled to ~1 second:

```js
audio.addEventListener('timeupdate', () => {
  if (!audio.duration || isNaN(audio.duration)) return;
  navigator.mediaSession.setPositionState({
    duration: audio.duration,
    playbackRate: audio.playbackRate,
    position: audio.currentTime,
  });
});
```

Call `setPositionState` immediately after handling any seek action. Set metadata (title, artist, artwork) before playback starts, not after.

**Warning signs:**
- Lock screen shows "0:00" or frozen timestamp during playback
- Seek bar on lock screen is absent or non-interactive
- Skip buttons on lock screen appear but produce no effect
- Works on desktop browser (has focus) but fails on phone lock screen

**Phase to address:** Media Session / player controls phase. Test specifically on a physical Android device with screen locked — desktop browser testing will not catch this.

---

### Pitfall 6: .m4b Chapter Metadata Is Inconsistent Across Files

**What goes wrong:**
`ffprobe` extracts chapter data from some .m4b files correctly but returns zero chapters, malformed timestamps, or missing titles for others. The chapter navigation UI breaks for affected books. In edge cases, chapter `start_time` values are in timebase units (e.g., 1/1000 milliseconds) rather than seconds and need explicit conversion.

**Why it happens:**
.m4b is an MPEG-4 container. Chapter metadata is stored as a special internal track, not in standard tag fields. Rippers, converters, and audiobook management tools (Calibre, m4b-tool, Audible AAX converters) produce subtly different chapter encodings. Some omit chapter titles entirely (generating "Chapter 1", "Chapter 2"). Some have chapters with identical start/end times. Some encode chapter titles with embedded HTML entities or Unicode that survives ffprobe raw output but breaks JSON serialization.

**How to avoid:**
At scan time, normalize all chapter data defensively:
- Convert `start_time` and `end_time` to float seconds explicitly (divide by `time_base` if present)
- Filter out zero-duration chapters (where `start_time === end_time`)
- Provide fallback chapter titles: `"Chapter ${index + 1}"` when title is empty or missing
- Treat books with zero extracted chapters as having a single implicit chapter (full duration)
- Test scan against a diverse sample of real .m4b files before shipping, not just the same rip tool

Run `ffprobe -v quiet -print_format json -show_chapters -show_format <file>` and validate the full output schema.

**Warning signs:**
- Chapter count is zero for some books but not others
- Chapter list shows empty string titles
- Chapter start times appear as large integers (e.g., `1200000`) instead of seconds
- Seeking to a chapter jumps to wrong position

**Phase to address:** Backend scan/metadata phase. Write chapter normalization logic with explicit defensive handling before building the chapter navigation UI.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Skip range request implementation, serve full file | Simpler endpoint code | Seeking broken; unusable on mobile; all users must buffer entire book before seeking | Never |
| Use Workbox precaching for audio files | Simple service worker setup | Service worker install becomes huge; breaks on quota; not how media caching works | Never — use explicit download instead |
| Store progress only in `localStorage` | Simple, synchronous API | No IndexedDB reliability; not available to service worker; evicted silently on iOS | Only for temporary session state, never for persisted position |
| Skip `navigator.storage.persist()` call | Less permission complexity | Cached audiobooks evicted when device storage runs low; user loses offline books silently | Only acceptable if offline downloads are not a feature |
| Single `/stream/:id` endpoint returning full file | Passes basic audio tests | Broken seeking, full file downloaded before play, high memory on server | Never for production audio streaming |
| Hardcode playback speed multipliers | Fast to ship | Playback speed desync with Media Session position state at non-1x speeds | Acceptable in MVP if noted; fix before shipping speed controls |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Workbox + audio | Using default CacheFirst without RangeRequestsPlugin | Always attach `RangeRequestsPlugin` and `CacheableResponsePlugin({ statuses: [200] })` to audio routes |
| Workbox + audio | Adding `crossorigin` only to cross-origin audio | Add `crossorigin` attribute to `<audio>` for same-origin URLs too — required for Workbox media caching |
| ffprobe + chapters | Parsing `chapters[].start_time` as-is | Always check `time_base` field and convert to seconds; validate duration > 0 per chapter |
| Media Session API + seekto | Not calling `setPositionState` after seek | Must update position state immediately after processing any seek action handler |
| IndexedDB + offline progress | Writing progress synchronously without transactions | Use IDB transactions; handle `QuotaExceededError`; add Web Locks if multiple tabs are possible |
| Docker + file streaming | Mounting library volume read-write | Mount as read-only (`:ro`); prevents accidental writes to source audiobook files |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Scanning all .m4b metadata on every API request | API response times of 5-30s; ffprobe spawned per request | Scan once at startup or on file-change events; cache all metadata in memory/JSON file | First book load; worsens linearly with library size |
| Loading cover art as full-resolution embed from .m4b | Library grid page loads slowly; large payloads over LAN | Extract covers once at scan time, store as resized JPEG on disk, serve as static files | Libraries of 50+ books; mobile connections |
| Spawning ffprobe process per chapter-seek request | High CPU; slow chapter navigation | All chapter data extracted at scan time and served from JSON cache | Any concurrent users or rapid chapter switching |
| Buffering entire audio file in Node.js memory | Server OOM with 2-3 concurrent listeners | Use `fs.createReadStream` with byte range; never `fs.readFileSync` for audio | Single 500MB .m4b file with 2 concurrent users |
| No request abort handling in audio stream endpoint | File stream continues reading after browser navigates away | Listen for `req.on('close', ...)` and destroy the read stream | Always — wasted I/O on every skip/seek |

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Audio streaming endpoint accepts arbitrary file paths | Path traversal — attacker streams any file on server | Resolve book ID to absolute path from library index; never pass client-supplied path segments to `fs` |
| Auth token in query string for audio stream URL | Token logged in server access logs, browser history, Referer headers | Use session cookies for auth; if token needed in URL, use short-lived signed tokens that expire in <5 minutes |
| No auth check on cover art / metadata endpoints | Library contents exposed without login | All API routes, including static-like endpoints (cover images, chapter lists), require session validation |
| Docker container runs as root | If exploited, attacker has host-level file access | Use `USER node` in Dockerfile; run as non-root; mount library read-only |
| Storing passwords as plaintext or weak hash | Credential exposure on DB leak | Use bcrypt with cost factor ≥12 for all password storage |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| No download progress indicator | User taps "Download" and sees nothing; taps again; downloads twice or gives up | Show byte progress (X MB / Y MB) with cancel option; persist download state across page navigations |
| Offline status not visible | User attempts to browse or play without knowing they're offline | Show persistent offline badge in nav; show which books are downloaded vs. streaming-only |
| Progress saved only on pause or navigation | Closing the tab abruptly loses position; user re-finds place manually | Save position on `timeupdate` every 10-15 seconds to IndexedDB, not only on pause/unload |
| Chapter list shows raw seconds | Technical users fine; non-technical household members confused | Display chapter timestamps as `H:MM:SS`; show current chapter highlighted |
| No resume confirmation after long gap | User accidentally restarts book after weeks away | If last position > 5 minutes ago, offer "Resume from Chapter 7 (2h 14m)" rather than silently resuming |
| Speed control resets on book change | Users who listen at 1.5x must reset every book | Persist playback speed preference in localStorage; apply it as the default for all books |

---

## "Looks Done But Isn't" Checklist

- [ ] **Audio seeking:** Audio element plays from start — verify seeking to 50% position works while OFFLINE (not just online streaming)
- [ ] **Range requests:** Check server response headers in DevTools — must see `206 Partial Content` and `Content-Range` header, not `200 OK`
- [ ] **Offline download:** Download a book, enable airplane mode, reload the PWA, play the book — full seek must work
- [ ] **Media Session lock screen:** Test on a physical Android device with screen locked — desktop DevTools Media panel does not replicate lock screen behavior
- [ ] **Progress persistence:** Close browser tab mid-chapter, reopen, verify resume position is accurate to within 15 seconds
- [ ] **Chapter extraction:** Run scan against at least 5 different .m4b files from different ripping tools — chapter counts must all be > 0 or fallback applied
- [ ] **Multi-user isolation:** Log in as User A, read to chapter 5. Log in as User B — verify User B's progress is unaffected
- [ ] **Storage persistence:** Check `navigator.storage.persisted()` returns `true` after offline download — if not, cached books are eviction candidates
- [ ] **Stream abort:** Navigate away mid-stream — verify no file descriptor leak (check server logs for stream cleanup)
- [ ] **Cover art:** Verify cover images load for all books in library, including books with non-ASCII filenames

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Range requests not implemented, seek broken | HIGH | Rewrite audio streaming endpoint; update service worker cache strategy; re-test all offline scenarios |
| Service worker caching strategy wrong for audio | MEDIUM | Update service worker registration; invalidate old caches; add RangeRequestsPlugin; bump cache version |
| Chapter extraction bugs found post-launch | MEDIUM | Fix normalization logic; trigger rescan; chapter data is computed at scan time, no migration needed |
| iOS audio stops on lock — users complain | LOW (expectation) | Document iOS limitation explicitly; recommend Android or browser tab for mobile use |
| Progress data lost on iOS due to eviction | MEDIUM | Add `navigator.storage.persist()` call; add sync-to-server fallback; add export/backup UI |
| Path traversal vulnerability in stream endpoint | HIGH | Emergency patch; audit all file-serving routes; rotate any exposed session tokens |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Range requests missing on server | Backend audio streaming | `curl -r 0-1023 /api/stream/:id` returns 206 with Content-Range header |
| Accept-Ranges header missing | Backend audio streaming | DevTools Network: audio requests show 206, not 200 |
| Service worker not handling range requests | Service worker / offline setup | Seek works after disabling network in DevTools |
| Runtime caching broken for large audio | Offline download feature | Offline play works after explicit "Download" action, not implicit |
| Media Session position state desync | Player controls phase | Lock screen scrubber matches audio position; test on physical Android |
| iOS audio stops on lock | Player controls phase | Documented as known limitation; not filed as a bug |
| .m4b chapter metadata inconsistency | Metadata scan phase | Scan 5+ different .m4b files; all produce chapter lists or fallback |
| Progress not persisted to IndexedDB | Progress tracking phase | Tab close mid-chapter; reopen; resume position within 15s accuracy |
| Storage not marked persistent | Offline download phase | `navigator.storage.persisted()` returns true post-install |
| Stream not aborted on client disconnect | Backend audio streaming | Server process file descriptor count stable under rapid seek/navigate |
| Path traversal in stream endpoint | Backend auth + streaming | Attempt `../../../etc/passwd` as book ID; verify 404 or 400, no file read |

---

## Sources

- Workbox: Serving Cached Audio and Video — https://developer.chrome.com/docs/workbox/serving-cached-audio-and-video (HIGH confidence — official Workbox documentation)
- Service Workers: Beware Safari's Range Request — https://philna.sh/blog/2018/10/23/service-workers-beware-safaris-range-request/ (HIGH confidence — specific technical bug documentation, verified against Workbox docs)
- web.dev: Media Session API — https://web.dev/articles/media-session (HIGH confidence — official Google documentation)
- MDN: Storage quotas and eviction criteria — https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria (HIGH confidence — official MDN)
- MDN: StorageManager.persist() — https://developer.mozilla.org/en-US/docs/Web/API/StorageManager/persist (HIGH confidence)
- What we learned about PWAs and audio playback — https://blog.prototyp.digital/what-we-learned-about-pwas-and-audio-playback/ (MEDIUM confidence — practitioner post-mortem, multiple confirming sources)
- PWA iOS Limitations 2026 — https://www.magicbell.com/blog/pwa-ios-limitations-safari-support-complete-guide (MEDIUM confidence — aggregated current status)
- Audiobookshelf chapter issues — https://github.com/advplyr/audiobookshelf/issues/676 (MEDIUM confidence — production system real-world data)
- m4b-tool chapter extraction issues — https://github.com/sandreas/m4b-tool/issues/6 (MEDIUM confidence — confirmed chapter metadata edge cases)
- IndexedDB pain and anguish — https://gist.github.com/pesterhazy/4de96193af89a6dd5ce682ce2adff49a (MEDIUM confidence — well-known community reference)

---
*Pitfalls research for: Self-hosted audiobook PWA (.m4b, Alpine.js, Workbox, Media Session API)*
*Researched: 2026-03-22*
