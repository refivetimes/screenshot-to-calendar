import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { parseEventWithGemini } from "./gemini.js";
import { createCalendarEvent } from "./calendar.js";

dotenv.config({ path: "../.env" });

const app = express();
const PORT = 54321;

app.use(cors());
app.use(express.json({ limit: "20mb" }));

app.post("/create-event", async (req, res) => {
  const { type, content } = req.body;

  if (!type || !content) {
    return res.status(400).json({ success: false, error: "Missing type or content" });
  }

  if (type !== "image" && type !== "text") {
    return res.status(400).json({ success: false, error: "type must be 'image' or 'text'" });
  }

  try {
    const eventData = await parseEventWithGemini(type, content);
    const result = await createCalendarEvent(eventData);
    res.json({ success: true, event: result });
  } catch (err) {
    console.error("Error creating event:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.listen(PORT, () => {
  console.log(`Screenshot-to-Calendar server running on http://localhost:${PORT}`);
});
