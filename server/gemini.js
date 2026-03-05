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

function buildSystemPrompt(calendarNames, defaultCalendar, lastBatch) {
  const calendarLine = calendarNames.length > 0
    ? `Available calendars: ${calendarNames.join(", ")}. You MUST pick one of these exact names for the "calendar" field. If unsure, use "${defaultCalendar}".`
    : `Default calendar name: "${defaultCalendar}".`;

  const today = new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

  return `You are a calendar assistant that can create new events or update existing ones.

Today's date is: ${today}

${calendarLine}

Determine the user's intent and return ONLY valid JSON (no markdown, no backticks, no explanation).

== CREATING NEW EVENTS ==
Use this when the input describes new events to schedule, or shows a screenshot of events to add.

Return:
{
  "action": "create",
  "events": [
    {
      "title": "string — event title/name",
      "startDate": "string — ISO 8601 format, e.g. 2026-02-26T14:00:00",
      "endDate": "string — ISO 8601 format, e.g. 2026-02-26T15:00:00. If not specified, set to 1 hour after startDate",
      "location": "string or null — event location. If a place name is mentioned, resolve it to a full street address in the format 'Place Name, Street Address, City, State ZIP'. Use your knowledge to provide the real address when possible. If you cannot determine the full address, return the location as-is.",
      "notes": "string or null — any additional details, description, or context",
      "isAllDay": "boolean — true if the event is an all-day event",
      "calendar": "string — which calendar to add to, must be one of the available calendars listed above"
    }
  ]
}

== UPDATING EXISTING EVENTS ==
Use this when the user wants to modify, change, or add information to events already on their calendar (e.g. "add location to all events called ...", "change time of ...", "update notes for ...").

Return:
{
  "action": "update",
  "match": {
    "titles": ["array of strings — one or more keywords to search for in event titles. Each keyword is matched independently (OR logic). Use short, distinct keywords that will reliably appear in the target event titles. e.g. [\"riso\", \"screenprinting\", \"basketweaving\"]"],
    "calendar": "string or null — limit to a specific calendar, or null for all calendars",
    "startAfter": "string or null — ISO 8601, only match events starting after this date",
    "startBefore": "string or null — ISO 8601, only match events starting before this date",
    "skipIfSet": "array of field names or null — skip events where these fields already have a value. Valid fields: \"location\", \"notes\", \"time\". Use when the user says things like \"that don't already have a location\", \"only events without notes\", \"events missing a location\", \"only all-day events\", \"events that don't have a time set\", etc. Use \"time\" to target only all-day events (skips events that already have a specific time)."
  },
  "update": {
    "title": "string — new title (omit if not changing)",
    "location": "string — new location (omit if not changing). Resolve place names to full addresses when possible.",
    "notes": "string — new notes (omit if not changing)",
    "startDate": "string — new start in ISO 8601 (omit if not changing)",
    "endDate": "string — new end in ISO 8601 (omit if not changing)"
  }
}
Only include fields in "update" that the user actually wants to change.

${lastBatch ? `== LAST BATCH ==\nThe most recent action was "${lastBatch.action}" at ${lastBatch.time}. Event titles: ${JSON.stringify(lastBatch.titles)}.\nIf the user refers to "the events I just added", "the last batch", "those events", etc., extract keywords from these titles for the "titles" match array.\n` : ""}== RULES ==
- Resolve relative dates (e.g. "tomorrow", "next Friday") relative to today's date.
- For create: if only a date with no time, set isAllDay to true.
- For create: if a duration is mentioned, calculate endDate from startDate.
- For create: if no end time or duration, default to 1 hour after start.
- For create: expand recurring patterns (e.g. "every Friday at 6pm in March") into individual events.
- For create: if a screenshot shows multiple events, extract all of them.
- For update: extract distinct, specific keywords from the user's description for title matching. If the user mentions multiple event types, use one keyword per type.
- For update: only include fields in "update" that should be changed.
- Return ONLY the JSON object, nothing else.`;
}

export async function parseEventWithGemini(type, content, calendarNames = [], defaultCalendar = "Home", lastBatch = null) {
  const SYSTEM_PROMPT = buildSystemPrompt(calendarNames, defaultCalendar, lastBatch);
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

  const objectMatch = text.match(/\{[\s\S]*\}/);
  const arrayMatch = text.match(/\[[\s\S]*\]/);

  if (!objectMatch && !arrayMatch) {
    throw new Error("Failed to parse response from AI");
  }

  if (objectMatch) {
    const parsed = JSON.parse(objectMatch[0]);

    if (parsed.action === "update") {
      if (parsed.match?.title && !parsed.match.titles) {
        parsed.match.titles = [parsed.match.title];
        delete parsed.match.title;
      }
      if (!parsed.match?.titles?.length) {
        throw new Error("Update response missing match criteria (titles)");
      }
      if (!parsed.update || Object.keys(parsed.update).length === 0) {
        throw new Error("Update response missing fields to update");
      }
      return parsed;
    }

    if (parsed.action === "create" && Array.isArray(parsed.events)) {
      validateEvents(parsed.events);
      return parsed;
    }

    if (parsed.title && parsed.startDate) {
      const events = [parsed];
      validateEvents(events);
      return { action: "create", events };
    }
  }

  if (arrayMatch) {
    const events = JSON.parse(arrayMatch[0]);
    if (Array.isArray(events)) {
      validateEvents(events);
      return { action: "create", events };
    }
  }

  throw new Error("Failed to parse event data from AI response");
}

function validateEvents(events) {
  for (const event of events) {
    if (!event.title || !event.startDate) {
      throw new Error("AI response missing required fields (title, startDate)");
    }
  }
}
