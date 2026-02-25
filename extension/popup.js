const SERVER_URL = "http://localhost:54321";

const dropZone = document.getElementById("drop-zone");
const fileInput = document.getElementById("file-input");
const preview = document.getElementById("preview");
const dropContent = document.querySelector(".drop-zone-content");
const textForm = document.getElementById("text-form");
const textInput = document.getElementById("text-input");
const sendBtn = document.getElementById("send-btn");
const status = document.getElementById("status");

let isProcessing = false;

// --- Image handling ---

function handleImageFile(file) {
  if (isProcessing || !file || !file.type.startsWith("image/")) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    showPreview(e.target.result);
    submitImage(e.target.result);
  };
  reader.readAsDataURL(file);
}

function showPreview(dataUrl) {
  preview.src = dataUrl;
  preview.hidden = false;
  dropContent.style.display = "none";
  dropZone.classList.add("has-image");
}

function resetPreview() {
  preview.src = "";
  preview.hidden = true;
  dropContent.style.display = "flex";
  dropZone.classList.remove("has-image");
}

// Click to upload
dropZone.addEventListener("click", () => {
  if (!isProcessing) fileInput.click();
});

fileInput.addEventListener("change", (e) => {
  if (e.target.files.length > 0) {
    handleImageFile(e.target.files[0]);
  }
});

// Drag and drop
dropZone.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropZone.classList.add("drag-over");
});

dropZone.addEventListener("dragleave", () => {
  dropZone.classList.remove("drag-over");
});

dropZone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropZone.classList.remove("drag-over");

  const file = e.dataTransfer.files[0];
  if (file) handleImageFile(file);
});

// Clipboard paste (works anywhere in the popup)
document.addEventListener("paste", (e) => {
  const items = e.clipboardData?.items;
  if (!items) return;

  for (const item of items) {
    if (item.type.startsWith("image/")) {
      e.preventDefault();
      handleImageFile(item.getAsFile());
      return;
    }
  }
});

// --- Text handling ---

textForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const text = textInput.value.trim();
  if (text && !isProcessing) {
    submitText(text);
  }
});

// --- API calls ---

async function submitImage(dataUrl) {
  await sendToServer("image", dataUrl);
}

async function submitText(text) {
  await sendToServer("text", text);
}

async function sendToServer(type, content) {
  if (isProcessing) return;
  isProcessing = true;
  setStatus("loading", "Creating calendar event...");
  disableInputs(true);

  try {
    const res = await fetch(`${SERVER_URL}/create-event`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, content }),
    });

    const data = await res.json();

    if (!res.ok || !data.success) {
      throw new Error(data.error || "Server returned an error");
    }

    const evt = data.event;
    const startDate = new Date(evt.start);
    const dateStr = startDate.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
    const timeStr = evt.isAllDay
      ? "All day"
      : startDate.toLocaleTimeString("en-US", {
          hour: "numeric",
          minute: "2-digit",
        });

    let details = `${dateStr} · ${timeStr}`;
    if (evt.location) details += ` · ${evt.location}`;

    setStatus(
      "success",
      `Event created!`,
      `<strong>${evt.title}</strong><br>${details}`
    );

    textInput.value = "";
    setTimeout(resetPreview, 2000);
  } catch (err) {
    const msg = err.message.includes("Failed to fetch")
      ? "Cannot reach server. Is it running on localhost:54321?"
      : err.message;
    setStatus("error", msg);
  } finally {
    isProcessing = false;
    disableInputs(false);
  }
}

// --- UI helpers ---

function setStatus(type, message, detailsHtml) {
  status.hidden = false;
  status.className = `status ${type}`;
  status.innerHTML = detailsHtml
    ? `${message}<div class="event-details">${detailsHtml}</div>`
    : message;
}

function disableInputs(disabled) {
  sendBtn.disabled = disabled;
  textInput.disabled = disabled;
  fileInput.disabled = disabled;
}
