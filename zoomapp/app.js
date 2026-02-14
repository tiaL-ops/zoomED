// Initialize Zoom Meeting SDK
ZoomMtg.setZoomJSLib("https://source.zoom.us/3.8.10/lib", "/av");
ZoomMtg.preLoadWasm();
ZoomMtg.prepareWebSDK();

// Auth endpoint (runs on port 4000)
const authEndpoint = "http://localhost:4000";
const leaveUrl = window.location.origin;
let eyeTracker = null;
let lastAttentionLogMs = 0;

function showError(message) {
  const errorDiv = document.getElementById("error-message");
  errorDiv.textContent = message;
  setTimeout(() => {
    errorDiv.textContent = "";
  }, 5000);
}

function getLandmarkCenter(landmarks, indices) {
  if (!landmarks || !indices || indices.length === 0) {
    return null;
  }

  let sumX = 0;
  let sumY = 0;
  for (const index of indices) {
    const point = landmarks[index];
    if (!point) {
      return null;
    }
    sumX += point.x;
    sumY += point.y;
  }

  return {
    x: sumX / indices.length,
    y: sumY / indices.length,
  };
}

function drawPoint(ctx, point, color) {
  if (!ctx || !point) {
    return;
  }
  ctx.beginPath();
  ctx.arc(point.x, point.y, 6, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
}

function getEyeOpenness(landmarks, indices) {
  if (!landmarks || !indices || indices.length < 6) {
    return null;
  }
  const [p1, p2, p3, p4, p5, p6] = indices.map((index) => landmarks[index]);
  if (!p1 || !p2 || !p3 || !p4 || !p5 || !p6) {
    return null;
  }

  const verticalA = Math.hypot(p2.x - p6.x, p2.y - p6.y);
  const verticalB = Math.hypot(p3.x - p5.x, p3.y - p5.y);
  const horizontal = Math.hypot(p1.x - p4.x, p1.y - p4.y);
  if (!horizontal) {
    return null;
  }

  return (verticalA + verticalB) / (2 * horizontal);
}

function getIrisHorizontalRatio(landmarks, iris, outerIndex, innerIndex) {
  if (!landmarks || !iris) {
    return null;
  }
  const outer = landmarks[outerIndex];
  const inner = landmarks[innerIndex];
  if (!outer || !inner) {
    return null;
  }
  const span = inner.x - outer.x;
  if (!span) {
    return null;
  }
  return (iris.x - outer.x) / span;
}

function logAttentionState(landmarks, gazePointNormalized, leftIris, rightIris) {
  const now = Date.now();
  if (now - lastAttentionLogMs < 1000) {
    return;
  }
  lastAttentionLogMs = now;

  const leftEAR = getEyeOpenness(landmarks, [33, 160, 158, 133, 153, 144]);
  const rightEAR = getEyeOpenness(landmarks, [362, 385, 387, 263, 373, 380]);
  if (leftEAR === null || rightEAR === null || !gazePointNormalized) {
    return;
  }

  const avgEAR = (leftEAR + rightEAR) / 2;
  const eyesClosed = avgEAR < 0.18;
  const gazeCentered =
    gazePointNormalized.x > 0.4 &&
    gazePointNormalized.x < 0.6 &&
    gazePointNormalized.y > 0.35 &&
    gazePointNormalized.y < 0.65;

  const leftIrisRatio = getIrisHorizontalRatio(landmarks, leftIris, 33, 133);
  const rightIrisRatio = getIrisHorizontalRatio(landmarks, rightIris, 362, 263);
  const irisCentered =
    leftIrisRatio !== null &&
    rightIrisRatio !== null &&
    leftIrisRatio > 0.35 &&
    leftIrisRatio < 0.65 &&
    rightIrisRatio > 0.35 &&
    rightIrisRatio < 0.65;

  let state = "distracted";
  if (eyesClosed) {
    state = "bored";
  } else if (gazeCentered && irisCentered) {
    state = "focused";
  }

  console.log("Attention:", {
    state,
    eyeOpenness: Number(avgEAR.toFixed(3)),
    gaze: {
      x: Number(gazePointNormalized.x.toFixed(3)),
      y: Number(gazePointNormalized.y.toFixed(3)),
    },
    iris: {
      left: leftIrisRatio === null ? null : Number(leftIrisRatio.toFixed(3)),
      right: rightIrisRatio === null ? null : Number(rightIrisRatio.toFixed(3)),
    },
  });
}

function startEyeTracking() {
  if (eyeTracker || !window.FaceMesh || !window.Camera) {
    return;
  }

  const video = document.getElementById("eye-video");
  const canvas = document.getElementById("eye-overlay");
  if (!video || !canvas) {
    return;
  }

  const ctx = canvas.getContext("2d");
  const resizeCanvas = () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  };
  resizeCanvas();
  window.addEventListener("resize", resizeCanvas);

  const faceMesh = new FaceMesh({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`,
  });
  faceMesh.setOptions({
    maxNumFaces: 1,
    refineLandmarks: true,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });

  faceMesh.onResults((results) => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const landmarks = results.multiFaceLandmarks && results.multiFaceLandmarks[0];
    if (!landmarks) {
      return;
    }

    const leftIris = getLandmarkCenter(landmarks, [468, 469, 470, 471, 472]);
    const rightIris = getLandmarkCenter(landmarks, [473, 474, 475, 476, 477]);
    if (!leftIris || !rightIris) {
      return;
    }

    const gaze = {
      x: (leftIris.x + rightIris.x) / 2,
      y: (leftIris.y + rightIris.y) / 2,
    };

    const leftPoint = {
      x: leftIris.x * canvas.width,
      y: leftIris.y * canvas.height,
    };
    const rightPoint = {
      x: rightIris.x * canvas.width,
      y: rightIris.y * canvas.height,
    };
    const gazePoint = {
      x: gaze.x * canvas.width,
      y: gaze.y * canvas.height,
    };

    drawPoint(ctx, leftPoint, "#ffcc00");
    drawPoint(ctx, rightPoint, "#ffcc00");
    drawPoint(ctx, gazePoint, "#00d1b2");
    logAttentionState(landmarks, gaze, leftIris, rightIris);
  });

  const camera = new Camera(video, {
    onFrame: async () => {
      await faceMesh.send({ image: video });
    },
    width: 640,
    height: 480,
  });

  const startResult = camera.start();
  if (startResult && typeof startResult.catch === "function") {
    startResult.catch((error) => {
      console.warn("Eye tracking camera error:", error);
    });
  }

  eyeTracker = {
    stop: () => {
      camera.stop();
      window.removeEventListener("resize", resizeCanvas);
    },
  };
}

function stopEyeTracking() {
  if (!eyeTracker) {
    return;
  }
  try {
    eyeTracker.stop();
  } finally {
    eyeTracker = null;
  }
  const canvas = document.getElementById("eye-overlay");
  if (canvas) {
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }
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
  // Hide the join form
  document.getElementById("join-form").style.display = "none";
  
  // Show Zoom meeting container
  document.getElementById("zmmtg-root").style.display = "block";

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
          document.body.classList.add("meeting-active");
          startEyeTracking();
        },
        error: (error) => {
          console.error("Join error:", error);
          showError("Failed to join meeting: " + error.reason);
          // Show form again
          document.getElementById("join-form").style.display = "block";
          document.getElementById("zmmtg-root").style.display = "none";
          document.body.classList.remove("meeting-active");
          stopEyeTracking();
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
      document.getElementById("zmmtg-root").style.display = "none";
      document.body.classList.remove("meeting-active");
      stopEyeTracking();
      const joinButton = document.getElementById("join-button");
      joinButton.disabled = false;
      joinButton.textContent = "Join Meeting";
    },
  });
}

// Handle page leave
window.addEventListener("beforeunload", () => {
  document.body.classList.remove("meeting-active");
  stopEyeTracking();
  ZoomMtg.endMeeting({});
});