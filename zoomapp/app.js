// Initialize Zoom Meeting SDK
ZoomMtg.setZoomJSLib("https://source.zoom.us/3.8.10/lib", "/av");
ZoomMtg.preLoadWasm();
ZoomMtg.prepareWebSDK();

// Auth endpoint (runs on port 4000)
const authEndpoint = "http://localhost:4000";
const leaveUrl = window.location.origin;

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
  document.getElementById("join-form").style.display = "none";
  document.getElementById("meeting-layout").classList.add("in-meeting");
  document.getElementById("zmmtg-root").style.display = "block";
  if (window.EngagementPanel && window.EngagementPanel.onJoin) {
    window.EngagementPanel.onJoin(meetingNumber, userName, role);
  }

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
          if (window.EngagementPanel && window.EngagementPanel.onMeetingJoined) {
            window.EngagementPanel.onMeetingJoined(role);
          }
        },
        error: (error) => {
          console.error("Join error:", error);
          showError("Failed to join meeting: " + error.reason);
          document.getElementById("join-form").style.display = "block";
          document.getElementById("meeting-layout").classList.remove("in-meeting");
          document.getElementById("zmmtg-root").style.display = "none";
          if (window.EngagementPanel && window.EngagementPanel.hide) window.EngagementPanel.hide();
          const joinButton = document.getElementById("join-button");
          joinButton.disabled = false;
          joinButton.textContent = "Join Meeting";
        },
      });
    },
    error: (error) => {
      console.error("Init error:", error);
      showError("Failed to initialize meeting SDK");
      document.getElementById("join-form").style.display = "block";
      document.getElementById("meeting-layout").classList.remove("in-meeting");
      document.getElementById("zmmtg-root").style.display = "none";
      if (window.EngagementPanel && window.EngagementPanel.hide) window.EngagementPanel.hide();
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