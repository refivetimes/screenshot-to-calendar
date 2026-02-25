# Screenshot to Calendar

A Chrome extension + local server that lets you paste a screenshot or type a natural language description to instantly create an Apple Calendar event. No intermediate confirmation steps — screenshot in, event out.

**Powered by Google Gemini 2.0 Flash (free tier) and macOS AppleScript.**

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

- **Screenshot**: Drag & drop an image, click the drop zone to upload from your file picker, or press **⌘V** to paste a screenshot from your clipboard. The event is created automatically.
- **Text**: Type a natural language description (e.g., *"Dentist appointment next Thursday at 2pm at 123 Main St"*) and press **Enter** or click Send.

The extension will show a confirmation with the event title, date/time, and location once it's been added to your calendar.

### Tips

- Take a screenshot with **⌘⇧4**, then open the extension and **⌘V** to paste — fastest workflow
- Relative dates work: "tomorrow", "next Friday", "in 3 days"
- Location and notes are extracted automatically when present
- Events default to 1 hour if no end time is specified
- Events are added to the **Home** calendar by default
