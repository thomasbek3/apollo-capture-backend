# Apollo Capture Backend — Intel

Reusable knowledge, design decisions, and patterns discovered during development.

---

## Claude Prompt Engineering

- **Dual-prompt strategy:** Primary prompt is detailed and specific; fallback prompt is simplified. If Claude fails on the primary, a single retry is attempted with the fallback. This handles edge cases where overly specific instructions confuse the model.
- **JSON-only output:** The system prompt instructs Claude to return raw JSON (no markdown fencing). The response is parsed with `JSON.parse()` directly.
- **Room segmentation schema:** Each room object includes `name`, `type`, `condition`, `features[]`, `inventory[]`, `startTime`, `endTime`, `transcript`.

## Notion Integration

- **Block batching:** Notion API limits to 100 blocks per `append_block_children` call. The `appendBlocksInBatches()` function chunks content to respect this.
- **Rate limiting:** A 350ms delay is inserted between Notion API calls to avoid 429 errors.
- **Idempotent sync:** Before creating a new page, the service searches for an existing page by property name. If found, it clears all content and re-appends (update-in-place).
- **Content clearing:** Uses `listBlockChildren` → `deleteBlock` for each child before re-appending. This avoids duplicate content on re-sync.

## File Storage

- **Railway volume:** Mounted at `/data` via Railway config. All persistent data lives here: captures, results, thumbnails, clips.
- **Temp uploads:** Multer writes to `/data/temp/uploads/{uploadId}/`. After processing, files are moved to permanent locations.
- **Static serving:** Express serves `/data` at `/api/files` with 1-day cache and immutable headers.
- **URL generation:** `storage.getFileUrl(relativePath)` builds API-accessible URLs using `BACKEND_BASE_URL`.

## FFmpeg Processing

- **Timeout:** Each clip generation has a 120-second timeout to prevent hanging on corrupt video.
- **Non-fatal:** Clip generation failures are caught and logged but don't fail the pipeline. The result will simply lack video clips.
- **Duration detection:** `ffprobe` is used to get video duration before clip generation.

## Photo Processing

- **Assignment priority:** Manual assignments from frontend (`photoRoomAssignments`) take precedence over timestamp-based matching.
- **Timestamp matching:** Photos are matched to rooms by finding the room whose time range contains the photo's timestamp.
- **Thumbnails:** Generated with Sharp at 300px (fit inside), JPEG quality 80. Stored separately from originals.

## Transcript Enhancement

- **Term normalization map:** Common property terms are normalized (e.g., "master bedroom" → "Primary Bedroom", "HVAC" → "HVAC System").
- **Duplicate merging:** Consecutive transcript items with identical text are merged into a single entry (common STT artifact).
- **Sentence capitalization:** First letter of each sentence is capitalized after cleaning.

## Error Handling Patterns

- **Pipeline resilience:** Steps 4 (clips) and 6 (Notion sync) are wrapped in try-catch and marked non-fatal. The capture result is still saved even if these fail.
- **Status tracking:** In-memory `Map` tracks processing status with step-by-step progress. If the server restarts, status is reconstructed from disk (result file existence).
- **Express error handler:** Catches unhandled errors, logs them, returns 500 with generic message.
