import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { parseEventWithGemini } from "./gemini.js";
import { createCalendarEvent, updateCalendarEvents, listCalendars } from "./calendar.js";

dotenv.config({ path: "../.env" });

const app = express();
const PORT = 54321;

app.use(cors());
app.use(express.json({ limit: "20mb" }));

let lastBatch = null;

app.post("/create-event", async (req, res) => {
  const { type, content } = req.body;
  const defaultCalendar = process.env.DEFAULT_CALENDAR?.trim() || "Home";

  if (!type || !content) {
    return res.status(400).json({ success: false, error: "Missing type or content" });
  }

  if (type !== "image" && type !== "text") {
    return res.status(400).json({ success: false, error: "type must be 'image' or 'text'" });
  }

  try {
    const calendars = await listCalendars();
    const parsed = await parseEventWithGemini(type, content, calendars, defaultCalendar, lastBatch);

    if (parsed.action === "update") {
      const result = await updateCalendarEvents(parsed.match, parsed.update);
      lastBatch = { action: "update", titles: result.titles, time: new Date().toISOString() };
      res.json({
        success: true,
        action: "update",
        updated: result.updated,
        titles: result.titles,
        match: parsed.match,
        updates: parsed.update,
      });
    } else {
      const results = [];
      for (const eventData of parsed.events) {
        results.push(await createCalendarEvent(eventData));
      }
      lastBatch = { action: "create", titles: results.map((r) => r.title), time: new Date().toISOString() };
      res.json({ success: true, action: "create", events: results });
    }
  } catch (err) {
    console.error("Error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.listen(PORT, () => {
  console.log(`Screenshot-to-Calendar server running on http://localhost:${PORT}`);
});
