# Apollo Capture Backend

Backend API service for **Apollo Capture** — a property walkthrough recording tool. This service receives a video recording, transcript, and photos from a mobile web app and processes them using AI (Claude) into structured property data.

## Quick Start

```bash
# Install dependencies
npm install

# Create .env from template
cp .env.example .env
# → Add your ANTHROPIC_API_KEY

# Run in development mode
npm run dev
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/health` | Health check |
| `POST` | `/api/capture/upload` | Upload capture data (multipart/form-data) |
| `GET` | `/api/capture/:captureId/status` | Check processing status |
| `GET` | `/api/capture/:captureId/result` | Get final processed result |

### Upload Format (multipart/form-data)

| Field | Type | Description |
|-------|------|-------------|
| `video` | File | Video recording (webm/mp4) |
| `photos` | File[] | JPEG/PNG photos captured during walkthrough |
| `transcript` | String (JSON) | `[{ text, timestampSeconds }]` |
| `photoMetadata` | String (JSON) | `[{ timestampSeconds, associatedRoom }]` |
| `roomBoundaries` | String (JSON) | `[{ roomName, timestampSeconds }]` |
| `propertyName` | String | Property name |
| `propertyAddress` | String | Property address |

## Processing Pipeline

1. **Transcript Enhancement** — Clean up speech-to-text output
2. **Room Segmentation** — Claude AI segments transcript into rooms with inventory
3. **Photo Association** — Match photos to rooms by timestamp + user overrides
4. **Room Clips** — Split video into per-room clips via FFmpeg (optional)
5. **Compile Result** — Final structured JSON output

## Deploy to Railway

1. Push to a GitHub repo
2. Connect the repo in Railway
3. Add a **Volume** mounted at `/data`
4. Set environment variables:
   - `ANTHROPIC_API_KEY`
   - `STORAGE_PATH=/data`
5. Deploy

## Environment Variables

See [`.env.example`](.env.example) for the full list.

## Tech Stack

- **Runtime**: Node.js 20 + Express
- **AI**: Anthropic Claude (claude-sonnet-4-20250514)
- **Video**: FFmpeg
- **Images**: Sharp
- **Storage**: Local filesystem (Railway volume)
