import { GoogleGenerativeAI } from "@google/generative-ai";

let genAI;
const DEFAULT_MODEL_CANDIDATES = [
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-1.5-flash",
];

function getClient() {
  if (!genAI) {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY is not set. Check your .env file and restart the server.");
    }
    genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  }
  return genAI;
}

function buildSystemPrompt(calendarNames, defaultCalendar) {
  const calendarLine = calendarNames.length > 0
    ? `Available calendars: ${calendarNames.join(", ")}. You MUST pick one of these exact names for the "calendar" field. If unsure, use "${defaultCalendar}".`
    : `Default calendar name: "${defaultCalendar}".`;

  return `You are a calendar event extraction assistant. Your job is to extract structured calendar event data from either a screenshot of an event/invitation or a natural language description.

Today's date is: ${new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}

${calendarLine}

Return ONLY valid JSON (no markdown, no backticks, no explanation). The input may describe one or multiple events (e.g. a list of dates, a recurring pattern like "every Friday in March", or a screenshot showing several events). Always return a JSON array of event objects, even if there is only one event.

Each event object has these fields:
{
  "title": "string — event title/name",
  "startDate": "string — ISO 8601 format, e.g. 2026-02-26T14:00:00",
  "endDate": "string — ISO 8601 format, e.g. 2026-02-26T15:00:00. If not specified, set to 1 hour after startDate",
  "location": "string or null — event location. If a place name is mentioned (e.g. a restaurant, venue, office), resolve it to a full street address in the format 'Place Name, Street Address, City, State ZIP'. Use your knowledge to provide the real address when possible. If you cannot determine the full address, return the location as-is.",
  "notes": "string or null — any additional details, description, or context",
  "isAllDay": "boolean — true if the event is an all-day event",
  "calendar": "string — which calendar to add to, must be one of the available calendars listed above"
}

Rules:
- Resolve relative dates (e.g. "tomorrow", "next Friday", "in 2 days") relative to today's date.
- If only a date is given with no time, set isAllDay to true.
- If a duration is mentioned (e.g. "2 hour meeting"), calculate the endDate from startDate.
- If no end time or duration is given, default to 1 hour after the start time.
- Extract location if mentioned anywhere in the text or visible in the screenshot.
- Put any extra context or details in the notes field.
- For recurring or repeating patterns (e.g. "every Friday at 6pm in March"), expand them into individual events for each occurrence.
- If a screenshot shows multiple events, extract all of them.
- Return ONLY the JSON array, nothing else.`;
}

export async function parseEventWithGemini(type, content, calendarNames = [], defaultCalendar = "Home") {
  const SYSTEM_PROMPT = buildSystemPrompt(calendarNames, defaultCalendar);
  const preferredModel = process.env.GEMINI_MODEL?.trim();
  const modelCandidates = preferredModel
    ? [preferredModel, ...DEFAULT_MODEL_CANDIDATES.filter((m) => m !== preferredModel)]
    : DEFAULT_MODEL_CANDIDATES;

  if (type === "image") {
    const imageData = content.replace(/^data:image\/\w+;base64,/, "");
    const mimeMatch = content.match(/^data:(image\/\w+);base64,/);
    const mimeType = mimeMatch ? mimeMatch[1] : "image/png";
    for (const modelName of modelCandidates) {
      try {
        const model = getClient().getGenerativeModel({ model: modelName });
        const result = await model.generateContent([
          SYSTEM_PROMPT,
          {
            inlineData: {
              data: imageData,
              mimeType,
            },
          },
          "Extract the calendar event details from this screenshot.",
        ]);
        return parseModelResponse(result);
      } catch (err) {
        const message = err?.message || "";
        const isModelUnavailable = message.includes("no longer available") || message.includes("[404 Not Found]");
        if (!isModelUnavailable || modelName === modelCandidates[modelCandidates.length - 1]) {
          throw err;
        }
      }
    }
  } else {
    for (const modelName of modelCandidates) {
      try {
        const model = getClient().getGenerativeModel({ model: modelName });
        const result = await model.generateContent([
          SYSTEM_PROMPT,
          `Extract the calendar event details from this description: "${content}"`,
        ]);
        return parseModelResponse(result);
      } catch (err) {
        const message = err?.message || "";
        const isModelUnavailable = message.includes("no longer available") || message.includes("[404 Not Found]");
        if (!isModelUnavailable || modelName === modelCandidates[modelCandidates.length - 1]) {
          throw err;
        }
      }
    }
  }
}

function parseModelResponse(result) {
  const text = result.response.text().trim();

  const arrayMatch = text.match(/\[[\s\S]*\]/);
  const objectMatch = text.match(/\{[\s\S]*\}/);

  let events;
  if (arrayMatch) {
    events = JSON.parse(arrayMatch[0]);
    if (!Array.isArray(events)) events = [events];
  } else if (objectMatch) {
    events = [JSON.parse(objectMatch[0])];
  } else {
    throw new Error("Failed to parse event data from AI response");
  }

  for (const event of events) {
    if (!event.title || !event.startDate) {
      throw new Error("AI response missing required fields (title, startDate)");
    }
  }

  return events;
}
