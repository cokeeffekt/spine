---
status: partial
phase: 05-lock-screen-controls
source: [05-VERIFICATION.md]
started: 2026-03-22T13:10:00Z
updated: 2026-03-22T13:10:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Lock Screen Metadata Display
expected: Lock screen shows book title formatted as '{Book Title} -- Ch. N: {Chapter Name}', author name, and cover art (or default headphones SVG). Requires Android device.
result: [pending]

### 2. Play/Pause and Skip Controls
expected: Lock-screen play/pause, skip-forward, and skip-back controls each respond correctly — audio pauses/resumes, chapters advance/retreat.
result: [pending]

### 3. Chapter-Scoped Scrubber
expected: Scrubber reflects chapter-relative position (0 to chapter duration). Dragging seeks correctly. Scrubber resets to 0 at chapter boundary.
result: [pending]

### 4. Chapter Boundary Transition
expected: Lock screen metadata updates to show new chapter title on chapter transition. No crash, no stuck scrubber.
result: [pending]

### 5. Metadata Cleared on Logout
expected: Media Session notification is cleared on logout — no stale book info shown.
result: [pending]

## Summary

total: 5
passed: 0
issues: 0
pending: 5
skipped: 0
blocked: 0

## Gaps
