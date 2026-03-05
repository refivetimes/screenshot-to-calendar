# Screenshot to Calendar

A Chrome extension + local server that lets you paste a screenshot or type a natural language description to instantly create or update Apple Calendar events. No intermediate confirmation steps — screenshot in, events out.

**Powered by Google Gemini Flash and macOS AppleScript.**

## Prerequisites

- **macOS** (required for Apple Calendar / AppleScript integration)
- **Node.js** 18+ (`node --version` to check)
- **Google AI Studio API key** (free) — get one at [aistudio.google.com/apikey](https://aistudio.google.com/app/apikey)

## Setup

### 1. Configure the API key

```bash
cp .env.example .env
```

Open `.env` and replace `your_api_key_here` with your Gemini API key.
Optionally set `GEMINI_MODEL` to force a specific model; by default, the server auto-falls back across supported Flash models.
Optionally set `DEFAULT_CALENDAR` (e.g. `Work`) to choose which Apple Calendar to use by default.

### 2. Install and start the server

**Option A: Run as a background service (recommended)**

```bash
./scripts/install-service.sh
```

This uses macOS `launchd` to run the server in the background. It starts automatically on login and restarts if it crashes. Logs go to `~/Library/Logs/screenshot-to-calendar/`.

To stop and uninstall the service:

```bash
./scripts/uninstall-service.sh
```

**Option B: Run manually in a terminal**

```bash
cd server
npm install
npm start
```

You should see: `Screenshot-to-Calendar server running on http://localhost:54321`

(Use `npm run dev` for auto-reload during development.)

### 3. Load the Chrome extension

1. Open Chrome and go to `chrome://extensions`
2. Enable **Developer mode** (toggle in the top-right)
3. Click **Load unpacked**
4. Select the `extension/` folder from this project

The extension icon will appear in your Chrome toolbar.

### 4. Grant Calendar permissions (first run only)

The first time you create an event, macOS will ask you to grant automation access. Click **OK** to allow the terminal/Node process to control Calendar.app.

If you accidentally deny it, go to **System Settings → Privacy & Security → Automation** and enable it manually.

## Usage

Click the extension icon in your Chrome toolbar:

- **Screenshot**: Drag & drop an image, click the drop zone to upload from your file picker, or press **⌘V** to paste a screenshot from your clipboard. Events are created automatically.
- **Text**: Type a natural language description and press **Enter** or click Send.

The extension shows a confirmation with the event title, date/time, and location once the action is complete.

### Creating events

Type a description or paste a screenshot. A few examples:

- *"Dentist appointment next Thursday at 2pm at 123 Main St"*
- *"Team lunch tomorrow at noon"*
- *"Yoga every Friday at 6pm in March"* — expands into one event per occurrence
- A screenshot showing a list of events — all of them are extracted and created at once

### Updating existing events

Describe what you want to change and which events to target. A few examples:

- *"Add location Lloyd Hall Boathouse to all events called 2026 Learn to Row"*
- *"Change notes for Book Club to bring your own copy"*
- *"Update title of tomorrow's standup to Sprint Planning"*

You can scope updates by calendar or date range naturally — e.g. *"...for all book club events in April"*.

The extension will report how many events were updated and list the matched event titles.

### Tips

- Take a screenshot with **⌘⇧4**, then open the extension and **⌘V** to paste — fastest workflow
- Relative dates work: "tomorrow", "next Friday", "in 3 days"
- Location and notes are extracted automatically when present
- Events default to 1 hour if no end time is specified
- Events are added to `DEFAULT_CALENDAR` if set, otherwise **Home**
- For updates, title matching is partial and case-insensitive — "learn to row" matches "2026 Learn to Row"
