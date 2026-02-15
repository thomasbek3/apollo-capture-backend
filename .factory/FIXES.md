# Apollo Capture Backend — Fixes & Known Issues

---

## FIX-001: CORS allows unknown origins
**Status:** 🟡 Open
**Found:** Session 001 (2026-02-14)
**File:** `src/index.js` (lines 14–22)

**Problem:** The CORS middleware logs unknown origins but still calls `callback(null, true)`, allowing all requests through regardless of origin.

**Impact:** Any domain can make cross-origin requests to the API. Low risk while the API has no auth, but should be tightened before adding sensitive endpoints.

**Fix:** Change the else branch to `callback(new Error('Not allowed by CORS'))` or add a strict mode toggle via env var.

---

## FIX-002: `.gitignore` has malformed `data /` entry
**Status:** 🟡 Open
**Found:** Session 001 (2026-02-14)
**File:** `.gitignore` (line 3)

**Problem:** The entry `/data/` in `.gitignore` may have a trailing space (`data /`), causing `git status` to emit: `warning: could not open directory 'data /': No such file or directory`.

**Impact:** Cosmetic — git warning on every status check. The `/data/` directory is still effectively ignored because it doesn't exist locally (it's a Railway volume mount).

**Fix:** Remove trailing whitespace from the `.gitignore` line.

---

## FIX-003: `read-pdf.js` references missing dependency
**Status:** 🟡 Open
**Found:** Session 001 (2026-02-14)
**File:** `read-pdf.js` (line 1)

**Problem:** Script requires `pdfjs-dist` which is not listed in `package.json`. Running it will fail with `MODULE_NOT_FOUND`.

**Impact:** None — this appears to be a legacy exploration script not used in production.

**Fix:** Either delete the file or add `pdfjs-dist` as a dev dependency.
