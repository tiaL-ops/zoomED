// Initialize Zoom Meeting SDK
ZoomMtg.setZoomJSLib("https://source.zoom.us/3.8.10/lib", "/av");
ZoomMtg.preLoadWasm();
ZoomMtg.prepareWebSDK();

// Auth endpoint (runs on port 4000)
const authEndpoint = "http://localhost:4000";
const backendEndpoint = "http://localhost:3000"; // Your Express backend
const leaveUrl = window.location.origin;

// Current meeting state for notes
let currentMeetingNumber = null;
let currentNotes = null;
let notesPanelVisible = true;
let transcriptBuffer = [];

function showError(message) {
  const errorDiv = document.getElementById("error-message");
  errorDiv.textContent = message;
  setTimeout(() => {
    errorDiv.textContent = "";
  }, 5000);
}

function joinMeeting() {
  // Get form values
  const meetingNumber = document.getElementById("meeting-number").value.replace(/\s/g, '');
  const passWord = document.getElementById("meeting-password").value;
  const userName = document.getElementById("user-name").value;
  const role = parseInt(document.getElementById("user-role").value);
  
  // Validate inputs
  if (!meetingNumber) {
    showError("Please enter a meeting ID");
    return;
  }
  
  if (!userName) {
    showError("Please enter your name");
    return;
  }
  
  // Disable join button
  const joinButton = document.getElementById("join-button");
  joinButton.disabled = true;
  joinButton.textContent = "Joining...";
  
  // Get signature from auth endpoint
  fetch(authEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      meetingNumber: meetingNumber,
      role: role,
    }),
  })
    .then((response) => {
      if (!response.ok) {
        throw new Error("Failed to get meeting signature");
      }
      return response.json();
    })
    .then((data) => {
      console.log("Signature received:", data);
      startMeeting(data.signature, data.sdkKey, meetingNumber, passWord, userName, role);
    })
    .catch((error) => {
      console.error("Error:", error);
      showError("Failed to join meeting. Make sure the auth server is running on port 4000.");
      joinButton.disabled = false;
      joinButton.textContent = "Join Meeting";
    });
}

function startMeeting(signature, sdkKey, meetingNumber, passWord, userName, role) {
  // Store meeting number for notes
  currentMeetingNumber = meetingNumber;
  
  // Hide the join form
  document.getElementById("join-form").style.display = "none";
  
  // Show meeting wrapper with notes panel
  document.getElementById("meeting-wrapper").classList.add("active");

  ZoomMtg.init({
    leaveUrl: leaveUrl,
    patchJsMedia: true,
    leaveOnPageUnload: true,
    success: (success) => {
      console.log("Init success:", success);
      
      ZoomMtg.join({
        signature: signature,
        sdkKey: sdkKey,
        meetingNumber: meetingNumber,
        passWord: passWord,
        userName: userName,
        userEmail: "",
        success: (success) => {
          console.log("Join success:", success);
          // Try to load existing notes
          loadNotesForMeeting(meetingNumber);
          // Start polling for transcript updates
          startTranscriptPolling(meetingNumber);
        },
        error: (error) => {
          console.error("Join error:", error);
          showError("Failed to join meeting: " + error.reason);
          // Show form again
          document.getElementById("join-form").style.display = "block";
          document.getElementById("meeting-wrapper").classList.remove("active");
          const joinButton = document.getElementById("join-button");
          joinButton.disabled = false;
          joinButton.textContent = "Join Meeting";
        },
      });
    },
    error: (error) => {
      console.error("Init error:", error);
      showError("Failed to initialize meeting SDK");
      // Show form again
      document.getElementById("join-form").style.display = "block";
      document.getElementById("meeting-wrapper").classList.remove("active");
      const joinButton = document.getElementById("join-button");
      joinButton.disabled = false;
      joinButton.textContent = "Join Meeting";
    },
  });
}

// Handle page leave
window.addEventListener("beforeunload", () => {
  ZoomMtg.endMeeting({});
});

// ==================== NOTES INTEGRATION ====================

function toggleNotesPanel() {
  const panel = document.getElementById("notes-panel");
  panel.style.display = panel.style.display === "none" ? "flex" : "none";
}

async function generateNotesFromMeeting() {
  if (!currentMeetingNumber) {
    alert("No active meeting");
    return;
  }

  const btn = document.getElementById("generate-notes-btn");
  btn.disabled = true;
  btn.textContent = "Generating...";

  try {
    const response = await fetch(`${backendEndpoint}/api/generate-notes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        meetingId: currentMeetingNumber,
        userConversation: "",
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to generate notes: ${response.statusText}`);
    }

    const data = await response.json();
    currentNotes = data.notes;
    displayNotes(currentNotes);
  } catch (error) {
    console.error("Error generating notes:", error);
    alert("Failed to generate notes: " + error.message);
  } finally {
    btn.disabled = false;
    btn.textContent = "Generate Notes";
  }
}

async function loadNotesForMeeting(meetingId) {
  try {
    const response = await fetch(`${backendEndpoint}/api/notes/${meetingId}`);
    if (response.ok) {
      const data = await response.json();
      currentNotes = data.notes;
      displayNotes(currentNotes);
    }
  } catch (error) {
    console.log("No existing notes found for this meeting");
  }
}

function displayNotes(notes) {
  if (!notes) return;

  const content = document.getElementById("notes-content");
  content.innerHTML = "";

  // Summary section
  if (notes.summary) {
    const summary = document.createElement("div");
    summary.className = "notes-summary";
    summary.innerHTML = `
      <h4>Summary</h4>
      <p>${notes.summary}</p>
    `;
    content.appendChild(summary);
  }

  // Key points section
  if (notes.key_points && notes.key_points.length > 0) {
    const pointsContainer = document.createElement("div");
    pointsContainer.className = "key-points-list";

    notes.key_points.forEach((kp, idx) => {
      const item = document.createElement("div");
      item.className = "key-point-item";
      item.onclick = () => expandKeyPoint(kp, item);
      item.innerHTML = `
        <div class="key-point-title">${kp.title}</div>
        <div class="key-point-importance">${kp.importance}</div>
      `;
      pointsContainer.appendChild(item);
    });

    content.appendChild(pointsContainer);
  }

  // Tags section
  if (notes.tags && notes.tags.length > 0) {
    const tagsDiv = document.createElement("div");
    tagsDiv.style.marginTop = "12px";
    tagsDiv.style.display = "flex";
    tagsDiv.style.flexWrap = "wrap";
    tagsDiv.style.gap = "6px";

    notes.tags.forEach((tag) => {
      const tagEl = document.createElement("span");
      tagEl.textContent = tag;
      tagEl.style.background = "#e8f4f8";
      tagEl.style.color = "#0077be";
      tagEl.style.padding = "4px 8px";
      tagEl.style.borderRadius = "12px";
      tagEl.style.fontSize = "0.75rem";
      tagsDiv.appendChild(tagEl);
    });

    content.appendChild(tagsDiv);
  }
}

function expandKeyPoint(keyPoint, element) {
  // Remove previous selection
  document.querySelectorAll(".key-point-item").forEach((el) => {
    el.classList.remove("selected");
  });

  // Add selection to clicked item
  element.classList.add("selected");

  // Show details
  const content = document.getElementById("notes-content");
  const details = document.createElement("div");
  details.style.marginTop = "16px";
  details.style.background = "#f8f9fa";
  details.style.padding = "12px";
  details.style.borderRadius = "6px";

  let html = `<h4 style="margin-top: 0; color: #333;">${keyPoint.title}</h4>`;
  html += `<p style="color: #666; font-size: 0.85rem; line-height: 1.4; margin: 8px 0;">${keyPoint.summary}</p>`;

  if (keyPoint.details && keyPoint.details.length > 0) {
    html += `<div style="margin-top: 8px;"><strong style="font-size: 0.8rem;">Details:</strong><ul style="margin: 4px 0; padding-left: 16px; font-size: 0.8rem;">`;
    keyPoint.details.forEach((detail) => {
      html += `<li style="margin: 2px 0;">${detail}</li>`;
    });
    html += `</ul></div>`;
  }

  // Find related associations
  if (currentNotes && currentNotes.associations) {
    const relatedAssocs = currentNotes.associations.filter(
      (a) => a.from_id === keyPoint.id || a.to_id === keyPoint.id
    );

    if (relatedAssocs.length > 0) {
      html += `<div style="margin-top: 8px;"><strong style="font-size: 0.8rem;">Connections:</strong><div style="font-size: 0.8rem;">`;
      relatedAssocs.forEach((assoc) => {
        html += `<div style="margin: 4px 0; padding: 4px; background: white; border-radius: 4px; border-left: 2px solid #764ba2;">
          <strong>${assoc.relationship_type}</strong>: ${assoc.description}
        </div>`;
      });
      html += `</div></div>`;
    }
  }

  details.innerHTML = html;

  // Remove old details if exists
  const oldDetails = content.querySelector("div[style*='margin-top: 16px']");
  if (oldDetails) oldDetails.remove();

  content.appendChild(details);
}

let transcriptPollingInterval = null;

function startTranscriptPolling(meetingId) {
  // Poll for transcript updates every 5 seconds during the meeting
  transcriptPollingInterval = setInterval(async () => {
    // In production, you would get actual transcripts from Zoom's transcript API
    // For now, we'll just check if notes exist
  }, 5000);
}

// Send transcript to backend when meeting ends
window.addEventListener("beforeunload", async () => {
  if (transcriptPollingInterval) {
    clearInterval(transcriptPollingInterval);
  }

  // Optionally save notes to a file or display a summary
  if (currentNotes) {
    console.log("Meeting ended with notes:", currentNotes);
  }
});