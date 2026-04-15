# Canvas Management Design

## Problem

Bot-created Slack canvases cannot be deleted from the Slack UI (no delete option in context menu). Users ended up with multiple orphaned "我愛工作" canvases, and the append-only approach caused stale or incorrectly formatted content after multiple `/summary` calls.

## Goals

1. One canvas per user — no duplicates accumulate
2. `/summary` always reflects the current state of the store (correct format, no stale data)
3. `/resetcanvas` provides a complete fresh start: clears both canvas content and store data
4. The "can't delete" problem is eliminated by design — users never need to delete a canvas

## Non-Goals

- Per-date-range upsert (too complex given Slack Canvas API limitations)
- Admin tools for viewing or exporting user data (separate concern)
- Canvas sharing or multi-user collaboration

## Design

### Canvas Uniqueness

Each user has exactly one canvas. The `canvasId` is persisted in `data/logs.json` (on Railway Volume). `getOrCreateCanvas` checks for an existing ID before calling `conversations.canvases.create`. With persistent storage and no delete-on-reset, the same canvas is reused indefinitely.

### `/summary` — Full Rewrite

Replace the append-only approach with a full canvas rewrite on every `/summary` call:

1. Fetch **all entries** for the user from the store (ignore the requested date range for canvas content — show complete history)
2. Format using `formatEntries`
3. Call `canvases.edit` with a `replace` operation targeting the full document content

The canvas always equals the store's current state. Running `/summary` twice produces the same result (idempotent).

### `/resetcanvas` — Complete Fresh Start

1. **Clear canvas content** — call `canvases.edit` to replace canvas body with empty content (keep title "我愛工作", reuse same `canvasId`)
2. **Delete store data** — remove all work log entries for the user from `data/logs.json`

The `canvasId` is NOT cleared — the same canvas continues to be used after reset. The user starts logging from scratch; the next `/summary` will write only new data.

**Expected user experience:** after `/resetcanvas`, both the canvas and the log history are empty. No old data reappears on the next `/summary`.

### Data Flow

```
/log → store.addEntry()
/summary → store.getAllEntries(userId) → formatEntries() → canvases.edit(replace)
/resetcanvas → canvases.edit(clear content) + store.deleteAllEntries(userId)
```

## Implementation Notes

- `store.js` needs a new `deleteAllEntries(userId)` function
- `canvas.js` `appendToCanvas` → replaced by `rewriteCanvas(client, canvasId, markdown)`
- `canvases.edit` with `replace` operation on the root section clears and rewrites all content
- `/resetcanvas` must be registered as a Slack slash command in the App manifest

## Open Questions

- None — design is fully resolved.
