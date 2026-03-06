## Cursor Cloud specific instructions

This is a Chrome Extension + Node.js Express server that converts screenshots/text into Apple Calendar events via Google Gemini and macOS AppleScript.

### Services

| Service | Command | Port | Notes |
|---------|---------|------|-------|
| Express server | `cd server && npm run dev` | 54321 | Auto-reloads via `node --watch` |

### Running the server

- `npm run dev` (in `server/`) starts the server with watch mode on port 54321.
- The server requires a `.env` file at the **workspace root** (not in `server/`) with `GEMINI_API_KEY` set. The server loads it via `dotenv.config({ path: "../.env" })`.
- If `GEMINI_API_KEY` is available as an environment variable, create `.env` with: `echo "GEMINI_API_KEY=$GEMINI_API_KEY" > .env`

### Key endpoints

- `GET /health` — returns `{"status":"ok"}`
- `POST /create-event` — accepts `{"type":"text"|"image", "content":"..."}`, parses via Gemini, creates calendar event

### Linux environment caveat

The calendar integration (`server/calendar.js`) uses macOS `osascript` (AppleScript) to interact with Apple Calendar.app. On Linux, the Gemini API parsing works correctly, but the final calendar creation/update step will fail with `spawn osascript ENOENT`. This is expected and not a code bug.

### No linting or tests

This project has no linter configuration (no ESLint, Prettier, etc.) and no automated test suite. See `server/package.json` for the two available npm scripts: `start` and `dev`.

### Chrome extension

The extension UI (`extension/popup.html`) can be previewed directly in a browser via `file:///workspace/extension/popup.html`. When loaded as an unpacked Chrome extension, it communicates with the server at `http://localhost:54321`.
