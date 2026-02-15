# Apollo Capture Backend — Development Plan

---

## Phase 1 ✅ — Core Backend
*Commits: `9f8349b` → `e0120ca`*

- [x] Express server with CORS, body parsing, static file serving
- [x] Multer upload middleware (video + photos + transcript)
- [x] Claude AI room segmentation with retry/fallback
- [x] Transcript enhancement and normalization
- [x] File storage service with Railway volume
- [x] Result compilation and status tracking
- [x] Docker build with FFmpeg + Sharp deps
- [x] Winston structured logging

---

## Phase 2 ✅ — Integrations & Media
*Commits: `35efc5b` → `76a8734`*

- [x] Notion SDK integration (create/update property pages)
- [x] Notion database setup script (`setup-notion.js`)
- [x] Photo ↔ room association (timestamp + manual override)
- [x] Thumbnail generation with Sharp
- [x] FFmpeg per-room video clip generation
- [x] Video clips and per-room transcripts in Notion pages
- [x] CORS update for Vercel deployment

---

## Phase 3 🔄 — Hardening & Polish
*Current focus*

- [x] Initialize `.factory/` protocol (SPEC, PLAN, LOG, FIXES, INTEL)
- [x] Remove legacy `read-pdf.js` (missing `pdfjs-dist` dependency)
- [ ] Fix CORS to reject unknown origins (currently permissive)
- [ ] Fix `.gitignore` `data /` path (contains trailing space)
- [ ] Add input validation for JSON fields in upload endpoint
- [ ] Improve error messages returned to clients
- [ ] Add request ID tracking across pipeline steps
- [ ] Health endpoint: add storage disk usage info

---

## Parking Lot 🅿️

Ideas for future phases — not prioritized:

- **Auth layer** — API key or JWT for upload endpoint
- **Webhook notifications** — notify frontend when processing completes
- **Batch processing** — queue multiple captures
- **Rate limiting** — per-client upload throttling
- **S3 migration** — move from Railway volume to S3/R2 for scalability
- **Test suite** — unit tests for services, integration tests for pipeline
- **CI/CD** — GitHub Actions for lint, test, deploy
- **Monitoring** — structured error reporting (Sentry or similar)
- **Multi-language support** — transcript normalization for non-English
