import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

function formatAppleScriptDate(isoString) {
  const d = new Date(isoString);
  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  const month = months[d.getMonth()];
  const day = d.getDate();
  const year = d.getFullYear();
  let hours = d.getHours();
  const minutes = d.getMinutes().toString().padStart(2, "0");
  const seconds = d.getSeconds().toString().padStart(2, "0");
  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12 || 12;
  return `${month} ${day}, ${year} at ${hours}:${minutes}:${seconds} ${ampm}`;
}

function escapeAppleScript(str) {
  if (!str) return "";
  return str.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export async function listCalendars() {
  const script = `
tell application "Calendar"
  set calNames to {}
  repeat with c in calendars
    set end of calNames to name of c
  end repeat
  set AppleScript's text item delimiters to "||"
  return calNames as text
end tell`;

  try {
    const { stdout } = await execFileAsync("osascript", ["-e", script]);
    return stdout.trim().split("||").map((n) => n.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

export async function createCalendarEvent(eventData) {
  const {
    title,
    startDate,
    endDate,
    location,
    notes,
    isAllDay,
  } = eventData;

  const configuredDefaultCalendar = process.env.DEFAULT_CALENDAR?.trim() || "Home";
  let calendar = eventData.calendar || configuredDefaultCalendar;

  const availableCalendars = await listCalendars();
  if (availableCalendars.length > 0 && !availableCalendars.includes(calendar)) {
    if (availableCalendars.includes(configuredDefaultCalendar)) {
      calendar = configuredDefaultCalendar;
    } else {
      calendar = availableCalendars[0];
    }
  }

  const escapedTitle = escapeAppleScript(title);
  const escapedLocation = escapeAppleScript(location);
  const escapedNotes = escapeAppleScript(notes);
  const escapedCalendar = escapeAppleScript(calendar);

  let script;

  if (isAllDay) {
    const startD = new Date(startDate);
    const endD = endDate ? new Date(endDate) : new Date(startD);
    if (!endDate) endD.setDate(endD.getDate() + 1);

    const startFormatted = formatAppleScriptDate(startD.toISOString());
    const endFormatted = formatAppleScriptDate(endD.toISOString());

    script = `
tell application "Calendar"
  tell calendar "${escapedCalendar}"
    set startD to date "${startFormatted}"
    set endD to date "${endFormatted}"
    set newEvent to make new event with properties {summary:"${escapedTitle}", start date:startD, end date:endD, allday event:true${escapedLocation ? `, location:"${escapedLocation}"` : ""}${escapedNotes ? `, description:"${escapedNotes}"` : ""}}
  end tell
end tell`;
  } else {
    const startFormatted = formatAppleScriptDate(startDate);
    const fallbackEnd = new Date(new Date(startDate).getTime() + 60 * 60 * 1000);
    const endFormatted = formatAppleScriptDate(endDate || fallbackEnd.toISOString());

    script = `
tell application "Calendar"
  tell calendar "${escapedCalendar}"
    set startD to date "${startFormatted}"
    set endD to date "${endFormatted}"
    set newEvent to make new event with properties {summary:"${escapedTitle}", start date:startD, end date:endD${escapedLocation ? `, location:"${escapedLocation}"` : ""}${escapedNotes ? `, description:"${escapedNotes}"` : ""}}
  end tell
end tell`;
  }

  try {
    await execFileAsync("osascript", ["-e", script]);
  } catch (err) {
    if (err.stderr?.includes("Not authorized")) {
      throw new Error(
        "macOS denied Calendar access. Go to System Settings > Privacy & Security > Automation and grant access."
      );
    }
    throw new Error(`AppleScript failed: ${err.stderr || err.message}`);
  }

  return {
    title,
    start: startDate,
    end: endDate,
    location: location || null,
    notes: notes || null,
    isAllDay: !!isAllDay,
    calendar,
  };
}
