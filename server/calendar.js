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

export async function updateCalendarEvents(match, updates) {
  const titles = match.titles || [match.title];

  const setLines = [];
  if (updates.title !== undefined)
    setLines.push(`set summary of evt to "${escapeAppleScript(updates.title)}"`);
  if (updates.location !== undefined)
    setLines.push(`set location of evt to "${escapeAppleScript(updates.location)}"`);
  if (updates.notes !== undefined)
    setLines.push(`set description of evt to "${escapeAppleScript(updates.notes)}"`);
  if (updates.startDate !== undefined)
    setLines.push(`set start date of evt to date "${formatAppleScriptDate(updates.startDate)}"`);
  if (updates.endDate !== undefined)
    setLines.push(`set end date of evt to date "${formatAppleScriptDate(updates.endDate)}"`);

  if (setLines.length === 0) {
    throw new Error("No fields to update");
  }

  const titleConditions = titles
    .map((t) => `summary contains "${escapeAppleScript(t)}"`)
    .join(" or ");
  const titleClause = titles.length > 1 ? `(${titleConditions})` : titleConditions;

  let dateSetup = "";
  let whoseClause = titleClause;

  if (match.startAfter) {
    dateSetup += `    set searchStart to date "${formatAppleScriptDate(match.startAfter)}"\n`;
    whoseClause += " and start date >= searchStart";
  }
  if (match.startBefore) {
    dateSetup += `    set searchEnd to date "${formatAppleScriptDate(match.startBefore)}"\n`;
    whoseClause += " and start date <= searchEnd";
  }

  let calScope;
  if (match.calendar) {
    calScope = `set calList to {calendar "${escapeAppleScript(match.calendar)}"}`;
  } else {
    calScope = "set calList to calendars";
  }

  const skipIfSet = match.skipIfSet || [];
  const fieldToProperty = { location: "location", notes: "description" };
  const skipChecks = skipIfSet
    .filter((f) => fieldToProperty[f] || f === "time")
    .map((f) => {
      if (f === "time") {
        return "if allday event of evt is false then set shouldSkip to true";
      }
      const prop = fieldToProperty[f];
      return `if ${prop} of evt is not "" and ${prop} of evt is not missing value then set shouldSkip to true`;
    });

  let innerBlock;
  if (skipChecks.length > 0) {
    innerBlock = `set shouldSkip to false
            ${skipChecks.join("\n            ")}
            if shouldSkip is false then
                ${setLines.join("\n                ")}
                set end of updatedNames to summary of evt
            end if`;
  } else {
    innerBlock = `${setLines.join("\n            ")}
            set end of updatedNames to summary of evt`;
  }

  const script = `
tell application "Calendar"
    set updatedNames to {}
${dateSetup}    ${calScope}
    repeat with cal in calList
        set evts to (every event of cal whose ${whoseClause})
        repeat with evt in evts
            ${innerBlock}
        end repeat
    end repeat
    set AppleScript's text item delimiters to "||"
    return updatedNames as text
end tell`;

  try {
    const { stdout } = await execFileAsync("osascript", ["-e", script]);
    const raw = stdout.trim();
    const titles = raw ? raw.split("||").map((t) => t.trim()).filter(Boolean) : [];
    return { updated: titles.length, titles };
  } catch (err) {
    if (err.stderr?.includes("Not authorized")) {
      throw new Error(
        "macOS denied Calendar access. Go to System Settings > Privacy & Security > Automation and grant access."
      );
    }
    throw new Error(`AppleScript failed: ${err.stderr || err.message}`);
  }
}
