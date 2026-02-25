import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const SYSTEM_PROMPT = `You are a calendar event extraction assistant. Your job is to extract structured calendar event data from either a screenshot of an event/invitation or a natural language description.

Today's date is: ${new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}

Return ONLY valid JSON (no markdown, no backticks, no explanation) with these fields:
{
  "title": "string — event title/name",
  "startDate": "string — ISO 8601 format, e.g. 2026-02-26T14:00:00",
  "endDate": "string — ISO 8601 format, e.g. 2026-02-26T15:00:00. If not specified, set to 1 hour after startDate",
  "location": "string or null — event location if mentioned",
  "notes": "string or null — any additional details, description, or context",
  "isAllDay": "boolean — true if the event is an all-day event",
  "calendar": "string — which calendar to add to, default to 'Home' if not specified"
}

Rules:
- Resolve relative dates (e.g. "tomorrow", "next Friday", "in 2 days") relative to today's date.
- If only a date is given with no time, set isAllDay to true.
- If a duration is mentioned (e.g. "2 hour meeting"), calculate the endDate from startDate.
- If no end time or duration is given, default to 1 hour after the start time.
- Extract location if mentioned anywhere in the text or visible in the screenshot.
- Put any extra context or details in the notes field.
- Return ONLY the JSON object, nothing else.`;

export async function parseEventWithGemini(type, content) {
  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

  let result;

  if (type === "image") {
    const imageData = content.replace(/^data:image\/\w+;base64,/, "");
    const mimeMatch = content.match(/^data:(image\/\w+);base64,/);
    const mimeType = mimeMatch ? mimeMatch[1] : "image/png";

    result = await model.generateContent([
      SYSTEM_PROMPT,
      {
        inlineData: {
          data: imageData,
          mimeType,
        },
      },
      "Extract the calendar event details from this screenshot.",
    ]);
  } else {
    result = await model.generateContent([
      SYSTEM_PROMPT,
      `Extract the calendar event details from this description: "${content}"`,
    ]);
  }

  const text = result.response.text().trim();

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("Failed to parse event data from AI response");
  }

  const eventData = JSON.parse(jsonMatch[0]);

  if (!eventData.title || !eventData.startDate) {
    throw new Error("AI response missing required fields (title, startDate)");
  }

  return eventData;
}
