// Initialize Zoom Meeting SDK
ZoomMtg.setZoomJSLib("https://source.zoom.us/3.8.10/lib", "/av");
ZoomMtg.preLoadWasm();
ZoomMtg.prepareWebSDK();

// Auth endpoint (runs on port 4000)
const authEndpoint = "http://localhost:4000";
const leaveUrl = window.location.origin;
let eyeTracker = null;
let lastAttentionLogMs = 0;
let unfocusedSinceMs = null;
let lastFocusPopupMs = 0;
let meetingWs = null;
const FOCUS_POPUP_COOLDOWN_MS = 7000;   // 7 sec between popups (was 12)
const UNFOCUSED_TRIGGER_MS = 1500;      // 1.5 sec looking away to trigger (was 2)
const NUDGE_POPUP_AUTO_QUESTION_MS = 18000;  // 18 sec: if user doesn't pick, trigger question agent
const LOOK_AWAY_COUNT_FOR_QUIZ = 3;    // after 3 look-aways, pop sidebar and trigger material quiz
const QUIZ_COOLDOWN_MS = 2 * 60 * 1000; // after answering, don't show new questions for 2 min (until next disengagement)
const NUDGE_GRACE_AFTER_QUIZ_MS = 60 * 1000; // 60s grace: no nudge right after finishing questions
let focusPopupShowCount = 0;           // how many times we've shown the focus popup this "session"
let sidebarQuizCooldownUntil = 0;     // ignore POLL_SUGGESTION until this time (so questions don't loop)
let questionRoundActive = false;      // while answering sidebar questions, pause nudge flow
let nudgeGraceUntil = 0;              // absolute timestamp until nudges are paused
const FOCUS_GAME_URL = "http://localhost:5173/videoapp";
const SERVER_WS_PORT = 3000;
const ATTENTION_POST_INTERVAL_MS = 5000;  // throttle attention events to server
let currentMeetingId = null;
let currentUserId = null;
let currentUserDisplayName = null;
let nudgePopupTimeoutId = null;
let lastAttentionPostMs = 0;

function postEventToServer(event) {
  if (!currentMeetingId) return;
  var scheme = location.protocol === "https:" ? "https:" : "http:";
  var host = location.hostname || "localhost";
  fetch(scheme + "//" + host + ":" + SERVER_WS_PORT + "/api/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...event, meetingId: currentMeetingId, ts: Date.now() }),
  }).catch(function () {});
}

function forwardChatToServer(chatData) {
  var sender = chatData && chatData.sender;
  var userId = sender && (sender.userId != null ? String(sender.userId) : sender.participantId);
  var displayName = (sender && (sender.name || sender.displayName)) || "Unknown";
  if (!userId) userId = "unknown";
  postEventToServer({
    type: "CHAT_MESSAGE",
    userId: userId,
    displayName: displayName,
  });
}

function pickTranscriptTextFromObject(obj) {
  if (!obj || typeof obj !== "object") return "";
  var candidates = [
    obj.messageContent,
    obj.msg,
    obj.text,
    obj.content,
    obj.captionMessage,
    obj.message,
    obj.caption,
    obj.transcript,
    obj.body,
  ];
  for (var i = 0; i < candidates.length; i += 1) {
    var c = candidates[i];
    if (typeof c === "string" && c.trim()) return c.trim();
  }
  if (Array.isArray(obj.lines)) {
    var joined = obj.lines
      .map(function (l) { return typeof l === "string" ? l : (l && (l.text || l.content || l.msg)) || ""; })
      .filter(Boolean)
      .join(" ")
      .trim();
    if (joined) return joined;
  }
  if (obj.payload && typeof obj.payload === "object") {
    var nested = pickTranscriptTextFromObject(obj.payload);
    if (nested) return nested;
  }
  return "";
}

// Forward live transcription to server so poll/question agent gets real-time context (Zoom: host must enable "save closed captions" / live transcript)
function forwardLiveTranscriptionToServer(data) {
  if (!currentMeetingId) return;
  var text = "";
  if (typeof data === "string") text = data.trim();
  if (!text) text = pickTranscriptTextFromObject(data);
  if (!text) return;
  var speaker = (data && (data.speakerName || data.userName || data.speaker || data.displayName)) ? String(data.speakerName || data.userName || data.speaker || data.displayName) : "";
  var scheme = location.protocol === "https:" ? "https:" : "http:";
  var host = location.hostname || "localhost";
  fetch(scheme + "//" + host + ":" + SERVER_WS_PORT + "/api/meetings/" + encodeURIComponent(currentMeetingId) + "/transcript", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lines: [{ text: text, speaker: speaker || undefined, ts: data.timeStamp || Date.now() }] }),
  }).catch(function () {});
}

function showError(message) {
  const errorDiv = document.getElementById("error-message");
  errorDiv.textContent = message;
  setTimeout(() => {
    errorDiv.textContent = "";
  }, 5000);
}

function connectMeetingWebSocket(meetingNumber) {
  if (meetingWs && meetingWs.readyState === WebSocket.OPEN) return;
  const scheme = location.protocol === "https:" ? "wss:" : "ws:";
  const host = location.hostname || "localhost";
  const url = scheme + "//" + host + ":" + SERVER_WS_PORT + "/ws?meetingId=" + encodeURIComponent(String(meetingNumber));
  try {
    meetingWs = new WebSocket(url);
    meetingWs.onmessage = function (event) {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === "POLL_SUGGESTION" && msg.payload) {
          if (msg.payload.reason !== "Look-away material quiz") return; // sidebar questions should only run for disengagement flow
          if (Date.now() < sidebarQuizCooldownUntil) return; // don't show new questions until next disengagement round
          const poll = msg.payload.poll;
          const hint = msg.payload.hint;
          if (poll && poll.questions && poll.questions.length > 0) {
            showPollInSidebar(poll);
            clearSidebarHint();
          } else if (hint) {
            showSidebarHint(hint);
          }
        }
      } catch (e) {}
    };
    meetingWs.onclose = function () {
      meetingWs = null;
    };
  } catch (e) {
    console.warn("Meeting WebSocket failed:", e);
  }
}

function closeMeetingWebSocket() {
  if (meetingWs) {
    try {
      meetingWs.close();
    } catch (e) {}
    meetingWs = null;
  }
}

var currentSidebarPoll = null;

function escapeHtml(s) {
  if (s == null) return "";
  var div = document.createElement("div");
  div.textContent = s;
  return div.innerHTML;
}

function renderPollHtml(poll) {
  var questions = (poll && poll.questions) || [];
  return questions
    .map(function (q, qIdx) {
      var correctIndex = q.correctIndex != null ? q.correctIndex : 0;
      var opts = (q.options || []).map(function (o, oIdx) {
        return (
          '<button type="button" class="poll-option-btn" data-question-index="' + qIdx + '" data-option-index="' + oIdx + '" data-correct-index="' + correctIndex + '">' +
          escapeHtml(o) +
          "</button>"
        );
      }).join("");
      return (
        '<div class="poll-question" data-question-index="' + qIdx + '">' +
        "<strong>" + escapeHtml(q.question) + "</strong>" +
        (opts ? '<div class="poll-options-btns">' + opts + "</div>" : "") +
        '<div class="poll-explanation" aria-live="polite"></div>' +
        "</div>"
      );
    })
    .join("");
}

function showSidebarHint(message) {
  const emptyEl = document.getElementById("sidebar-questions-empty");
  const container = document.getElementById("sidebar-questions-content");
  if (emptyEl) {
    emptyEl.textContent = message;
    emptyEl.style.display = "";
  }
  if (container) container.innerHTML = "";
}

function clearSidebarHint() {
  const emptyEl = document.getElementById("sidebar-questions-empty");
  if (emptyEl) {
    emptyEl.textContent = "No questions yet. When you look away 3 times, the agent will prompt you with a question on the material here.";
  }
}

function showPollInSidebar(poll) {
  var container = document.getElementById("sidebar-questions-content");
  var emptyEl = document.getElementById("sidebar-questions-empty");
  if (!container) return;
  if (!poll || !poll.questions || poll.questions.length === 0) {
    container.innerHTML = "";
    currentSidebarPoll = null;
    questionRoundActive = false;
    if (emptyEl) emptyEl.style.display = "";
    return;
  }
  questionRoundActive = true;
  // Pause nudge flow while user is answering questions.
  clearNudgePopupTimeout();
  hideFocusPopup();
  currentSidebarPoll = poll;
  container.innerHTML = renderPollHtml(poll);
  container.removeAttribute("data-poll-bound"); // re-bind for new buttons
  if (emptyEl) emptyEl.style.display = "none";
  openSidebarIfCollapsed();
  bindSidebarPollOptions(container);
}

function collapseSidebarAfterAnswered() {
  var sidebar = document.getElementById("engagement-sidebar");
  if (sidebar) {
    sidebar.classList.add("collapsed");
    document.body.classList.add("student-panel-collapsed");
  }
  var collapseBtn = document.getElementById("sidebar-collapse-btn");
  if (collapseBtn) {
    collapseBtn.textContent = "»";
    collapseBtn.setAttribute("aria-label", "Expand panel");
    collapseBtn.title = "Expand panel";
  }
  // Resume nudge flow only after question set is completed.
  questionRoundActive = false;
  focusPopupShowCount = 0;
  unfocusedSinceMs = null;
  nudgeGraceUntil = Date.now() + NUDGE_GRACE_AFTER_QUIZ_MS;
  sidebarQuizCooldownUntil = Date.now() + QUIZ_COOLDOWN_MS; // no new questions until next disengagement
}

function bindSidebarPollOptions(container) {
  if (!container || container.dataset.pollBound) return;
  container.dataset.pollBound = "true";
  container.addEventListener("click", function (e) {
    var btn = e.target && e.target.closest && e.target.closest(".poll-option-btn");
    if (!btn) return;
    var questionBlock = btn.closest(".poll-question");
    if (questionBlock && questionBlock.dataset.answered === "true") return;
    var qIdx = parseInt(btn.getAttribute("data-question-index"), 10);
    var oIdx = parseInt(btn.getAttribute("data-option-index"), 10);
    var correctIdx = parseInt(btn.getAttribute("data-correct-index"), 10);
    var isCorrect = oIdx === correctIdx;
    var questions = (currentSidebarPoll && currentSidebarPoll.questions) || [];
    var q = questions[qIdx];
    var options = (q && q.options) || [];
    var correctText = options[correctIdx];
    var explanationEl = questionBlock ? questionBlock.querySelector(".poll-explanation") : null;

    if (isCorrect) {
      btn.classList.add("correct");
      if (explanationEl) explanationEl.textContent = "Correct!";
      if (questionBlock) questionBlock.dataset.answered = "true";
      if (questionBlock) questionBlock.dataset.correct = "true";
    } else {
      btn.classList.add("wrong", "shake");
      if (explanationEl) explanationEl.textContent = "Incorrect. The correct answer was: " + (correctText || "—") + ".";
      if (questionBlock) questionBlock.dataset.answered = "true";
      var correctBtn = questionBlock && questionBlock.querySelector('.poll-option-btn[data-option-index="' + correctIdx + '"]');
      if (correctBtn) correctBtn.classList.add("correct");
    }

    // When all questions are answered (correct or wrong), collapse sidebar and start cooldown so no loop
    setTimeout(function () {
      var allQuestions = container.querySelectorAll(".poll-question");
      var allAnswered = allQuestions.length > 0;
      allQuestions.forEach(function (el) { if (el.dataset.answered !== "true") allAnswered = false; });
      if (allAnswered) {
        allQuestions.forEach(function (el) { el.classList.add("answered-correct"); });
        setTimeout(function () {
          collapseSidebarAfterAnswered();
        }, 600);
      }
    }, isCorrect ? 800 : 400);
  });
}

function openSidebarIfCollapsed() {
  const sidebar = document.getElementById("engagement-sidebar");
  const btn = document.getElementById("sidebar-collapse-btn");
  if (!sidebar || !sidebar.classList.contains("collapsed")) return;
  sidebar.classList.remove("collapsed");
  document.body.classList.remove("student-panel-collapsed");
  if (btn) {
    btn.textContent = "«";
    btn.setAttribute("aria-label", "Collapse panel");
    btn.title = "Collapse panel";
  }
}

function showPollPopup(poll) {
  const overlay = document.getElementById("poll-popup-overlay");
  const content = document.getElementById("poll-popup-content");
  if (!overlay || !content) return;
  content.innerHTML = renderPollHtml(poll);
  overlay.classList.add("active");
}

function hidePollPopup() {
  const overlay = document.getElementById("poll-popup-overlay");
  if (overlay) overlay.classList.remove("active");
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
  if (now - lastAttentionLogMs < 400) {
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
  // Tighter "focused" band so looking slightly away triggers refocus sooner
  const gazeCentered =
    gazePointNormalized.x > 0.42 &&
    gazePointNormalized.x < 0.58 &&
    gazePointNormalized.y > 0.38 &&
    gazePointNormalized.y < 0.62;

  const leftIrisRatio = getIrisHorizontalRatio(landmarks, leftIris, 33, 133);
  const rightIrisRatio = getIrisHorizontalRatio(landmarks, rightIris, 362, 263);
  const irisCentered =
    leftIrisRatio !== null &&
    rightIrisRatio !== null &&
    leftIrisRatio > 0.38 &&
    leftIrisRatio < 0.62 &&
    rightIrisRatio > 0.38 &&
    rightIrisRatio < 0.62;

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

  updateFocusPopup(state);

  // Send attention to server (throttled) for engagement summarizer
  if (currentMeetingId && currentUserId && eyeTracker) {
    if (now - lastAttentionPostMs >= ATTENTION_POST_INTERVAL_MS) {
      lastAttentionPostMs = Date.now();
      var score = state === "focused" ? 0.85 : state === "bored" ? 0.2 : 0.45;
      postEventToServer({
        type: "ATTENTION_SCORE",
        userId: currentUserId,
        displayName: currentUserDisplayName || "Unknown",
        cv_attention_score: score,
      });
    }
  }
}

function getFocusPopupElements() {
  return {
    overlay: document.getElementById("focus-popup-overlay"),
    gameButton: document.getElementById("focus-game-btn"),
    closeButton: document.getElementById("focus-close-btn"),
  };
}

function clearNudgePopupTimeout() {
  if (nudgePopupTimeoutId) {
    clearTimeout(nudgePopupTimeoutId);
    nudgePopupTimeoutId = null;
  }
}

function showFocusPopup() {
  if (Date.now() < nudgeGraceUntil) return; // grace period after questions
  if (questionRoundActive) return; // do not nudge while user is actively answering a question
  const { overlay } = getFocusPopupElements();
  if (!overlay) {
    return;
  }
  focusPopupShowCount += 1;
  overlay.classList.add("active");
  clearNudgePopupTimeout();
  nudgePopupTimeoutId = setTimeout(function () {
    nudgePopupTimeoutId = null;
    hideFocusPopup();
    unfocusedSinceMs = Date.now();
    if (currentMeetingId) {
      var scheme = location.protocol === "https:" ? "https:" : "http:";
      var host = location.hostname || "localhost";
      fetch(scheme + "//" + host + ":" + SERVER_WS_PORT + "/api/nudge-timeout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ meetingId: currentMeetingId }),
      }).catch(function () {});
    }
  }, NUDGE_POPUP_AUTO_QUESTION_MS);

  // After 3 look-aways: pop out the sidebar and trigger material quiz from the agent
  if (focusPopupShowCount >= LOOK_AWAY_COUNT_FOR_QUIZ && currentMeetingId && currentUserId) {
    openSidebarIfCollapsed();
    triggerMaterialQuiz();
    focusPopupShowCount = 0; // reset so next 3 look-aways trigger again
  }
}

function hideFocusPopup() {
  clearNudgePopupTimeout();
  const { overlay } = getFocusPopupElements();
  if (!overlay) {
    return;
  }
  overlay.classList.remove("active");
}

function updateFocusPopup(state) {
  if (Date.now() < nudgeGraceUntil) {
    unfocusedSinceMs = null;
    hideFocusPopup();
    return;
  }
  if (questionRoundActive) {
    // Freeze nudge logic while question round is active.
    unfocusedSinceMs = null;
    hideFocusPopup();
    return;
  }
  const now = Date.now();
  // Do not auto-hide popup when user looks back; they must choose "I am back" or "Open focus game"
  if (state === "focused") {
    unfocusedSinceMs = null;
    return;
  }

  if (state !== "bored" && state !== "distracted") {
    return;
  }

  if (!unfocusedSinceMs) {
    unfocusedSinceMs = now;
  }

  const unfocusedDuration = now - unfocusedSinceMs;
  const canShow = now - lastFocusPopupMs > FOCUS_POPUP_COOLDOWN_MS;
  if (unfocusedDuration >= UNFOCUSED_TRIGGER_MS && canShow) {
    lastFocusPopupMs = now;
    showFocusPopup();
  }
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

    // Do not draw gaze dots on screen (privacy; not visible to students)
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

  const { gameButton, closeButton, overlay } = getFocusPopupElements();
  if (gameButton && !gameButton.dataset.bound) {
    gameButton.addEventListener("click", () => {
      clearNudgePopupTimeout();
      window.alert("To do: implement game");
      hideFocusPopup();
      unfocusedSinceMs = Date.now();
    });
    gameButton.dataset.bound = "true";
  }
  if (closeButton && !closeButton.dataset.bound) {
    closeButton.addEventListener("click", () => {
      clearNudgePopupTimeout();
      hideFocusPopup();
      unfocusedSinceMs = Date.now();
    });
    closeButton.dataset.bound = "true";
  }
  if (overlay && !overlay.dataset.bound) {
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) {
        clearNudgePopupTimeout();
        hideFocusPopup();
        unfocusedSinceMs = Date.now();
      }
    });
    overlay.dataset.bound = "true";
  }
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
  unfocusedSinceMs = null;
  clearNudgePopupTimeout();
  hideFocusPopup();
  const canvas = document.getElementById("eye-overlay");
  if (canvas) {
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }
  updateFocusTrackingUI();
}

function getFocusTrackingOptIn() {
  return document.getElementById("focus-tracking-opt-in");
}

function getFocusTrackingOnBar() {
  return document.getElementById("focus-tracking-on-bar");
}

function showFocusTrackingOptIn() {
  const el = getFocusTrackingOptIn();
  if (el) el.classList.remove("hidden");
}

function hideFocusTrackingOptIn() {
  const el = getFocusTrackingOptIn();
  if (el) el.classList.add("hidden");
}

function showFocusTrackingOnBar() {
  const el = getFocusTrackingOnBar();
  if (el) el.classList.add("visible");
}

function hideFocusTrackingOnBar() {
  const el = getFocusTrackingOnBar();
  if (el) el.classList.remove("visible");
}

function getFocusTrackingReopenBtn() {
  return document.getElementById("focus-tracking-reopen-btn");
}

function showReopenButton() {
  const el = getFocusTrackingReopenBtn();
  if (el) el.classList.add("visible");
}

function hideReopenButton() {
  const el = getFocusTrackingReopenBtn();
  if (el) el.classList.remove("visible");
}

function updateFocusTrackingUI() {
  if (eyeTracker) {
    hideFocusTrackingOptIn();
    showFocusTrackingOnBar();
    hideReopenButton();
  } else {
    hideFocusTrackingOnBar();
    showFocusTrackingOptIn();
  }
}

function bindFocusTrackingButton() {
  const enableBtn = document.getElementById("enable-focus-tracking-btn");
  const notNowBtn = document.getElementById("focus-tracking-not-now-btn");
  const turnOffBtn = document.getElementById("focus-tracking-turn-off-btn");

  if (enableBtn && !enableBtn.dataset.bound) {
    enableBtn.addEventListener("click", () => {
      startEyeTracking();
      hideFocusTrackingOptIn();
      showFocusTrackingOnBar();
      hideReopenButton();
    });
    enableBtn.dataset.bound = "true";
  }
  if (notNowBtn && !notNowBtn.dataset.bound) {
    notNowBtn.addEventListener("click", () => {
      hideFocusTrackingOptIn();
      showReopenButton();
    });
    notNowBtn.dataset.bound = "true";
  }
  const reopenBtn = document.getElementById("focus-tracking-reopen-btn");
  if (reopenBtn && !reopenBtn.dataset.bound) {
    reopenBtn.addEventListener("click", () => {
      showFocusTrackingOptIn();
      hideReopenButton();
    });
    reopenBtn.dataset.bound = "true";
  }
  if (turnOffBtn && !turnOffBtn.dataset.bound) {
    turnOffBtn.addEventListener("click", () => {
      stopEyeTracking();
      hideFocusTrackingOnBar();
      showFocusTrackingOptIn();
    });
    turnOffBtn.dataset.bound = "true";
  }

  updateFocusTrackingUI();
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
  
  // Show meeting layout (Zoom UI); sidebar stays hidden until we're actually in the call (join success)
  const meetingLayout = document.getElementById("meeting-layout");
  const sidebar = document.getElementById("engagement-sidebar");
  if (meetingLayout) meetingLayout.classList.add("in-meeting");
  document.body.classList.add("student-panel-open", "joining");
  document.body.classList.remove("student-panel-collapsed");
  if (sidebar) sidebar.classList.remove("collapsed");
  document.getElementById("zmmtg-root").style.display = "block";
  bindSidebarToggle();
  var collapseBtn = document.getElementById("sidebar-collapse-btn");
  if (collapseBtn) { collapseBtn.textContent = "«"; collapseBtn.setAttribute("aria-label", "Collapse panel"); collapseBtn.title = "Collapse panel"; }

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
          document.body.classList.remove("joining");
          document.body.classList.add("meeting-active", "in-call");
          currentMeetingId = String(meetingNumber);
          currentUserId = "u-" + (userName || "user").replace(/\W/g, "_").toLowerCase().slice(0, 30);
          currentUserDisplayName = userName || "Unknown";
          focusPopupShowCount = 0; // reset look-away count on join
          bindFocusTrackingButton();
          connectMeetingWebSocket(meetingNumber);
          bindPollPopupClose();
          // Bootstrap meeting: register participant so agents have data
          postEventToServer({
            type: "participant_joined",
            userId: currentUserId,
            displayName: currentUserDisplayName,
          });
          // Listen for chat and forward to server for engagement summarizer
          try {
            ZoomMtg.inMeetingServiceListener("onReceiveChatMsg", forwardChatToServer);
          } catch (e) {
            console.warn("Chat listener registration failed:", e);
          }
          // Live transcription: forward to server so poll/question agent gets real-time class context (host must enable "save closed captions")
          try {
            ZoomMtg.inMeetingServiceListener("onReceiveTranscriptionMsg", forwardLiveTranscriptionToServer);
          } catch (e) {
            console.warn("Transcription listener registration failed:", e);
          }
          // Some SDK versions/meeting settings emit caption events with a different name.
          try {
            ZoomMtg.inMeetingServiceListener("onReceiveCaptionMessage", forwardLiveTranscriptionToServer);
          } catch (e) {
            // Optional listener; ignore if unavailable in this SDK build.
          }
          var scheme = location.protocol === "https:" ? "https:" : "http:";
          var host = location.hostname || "localhost";
          var reportUrl = scheme + "//" + host + ":5173/report?meetingId=" + encodeURIComponent(currentMeetingId);
          var reportLink = document.getElementById("open-report-link");
          if (reportLink) reportLink.href = reportUrl;
          // Do not auto-start camera; only start when user clicks "Enable focus tracking" (privacy)
        },
        error: (error) => {
          console.error("Join error:", error);
          showError("Failed to join meeting: " + error.reason);
          // Show form again
          document.getElementById("join-form").style.display = "block";
          var ml = document.getElementById("meeting-layout");
          if (ml) ml.classList.remove("in-meeting");
          document.body.classList.remove("student-panel-open", "student-panel-collapsed", "meeting-active", "in-call", "joining");
          document.getElementById("zmmtg-root").style.display = "none";
          stopEyeTracking();
          closeMeetingWebSocket();
          currentMeetingId = null;
          currentUserId = null;
          currentUserDisplayName = null;
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
      var ml = document.getElementById("meeting-layout");
      if (ml) ml.classList.remove("in-meeting");
      document.body.classList.remove("student-panel-open", "student-panel-collapsed", "meeting-active", "in-call", "joining");
      document.getElementById("zmmtg-root").style.display = "none";
      const joinButton = document.getElementById("join-button");
      joinButton.disabled = false;
      joinButton.textContent = "Join Meeting";
    },
  });
}

function triggerMaterialQuiz() {
  var scheme = location.protocol === "https:" ? "https:" : "http:";
  var host = location.hostname || "localhost";
  var apiBase = scheme + "//" + host + ":" + SERVER_WS_PORT;
  var localhostBase = "http://localhost:" + SERVER_WS_PORT;

  if (!currentMeetingId || !currentUserId) {
    showSidebarHint("Join a meeting first, then try the question again.");
    return;
  }

  sidebarQuizCooldownUntil = 0; // allow this round's response to show; next questions only after next disengagement
  var url = "/api/meetings/" + encodeURIComponent(currentMeetingId) + "/trigger-material-quiz";
  var body = JSON.stringify({ userId: currentUserId, displayName: currentUserDisplayName || "Unknown" });
  var opts = { method: "POST", headers: { "Content-Type": "application/json" }, body: body };

  showSidebarHint("Loading question…");

  function doFetch(base) {
    return fetch(base + url, opts)
      .then(function (res) {
        if (!res.ok) {
          return res.json().catch(function () { return {}; }).then(function (data) {
            var err = new Error(data.error || "Server error " + res.status);
            err.status = res.status;
            throw err;
          });
        }
        return res.json();
      });
  }

  function onData(data) {
      if (data && data.poll && data.poll.questions && data.poll.questions.length > 0) {
        showPollInSidebar(data.poll);
        clearSidebarHint();
    } else if (data && data.hint) {
      showSidebarHint(data.hint);
    } else {
      showSidebarHint("No question right now. Add CLAUDE_API_KEY in server/.env and ensure transcript or lecture is available.");
    }
  }

  doFetch(apiBase)
    .then(onData)
    .catch(function (err) {
      if (err.status === 404 && apiBase !== localhostBase) {
        doFetch(localhostBase).then(onData).catch(function (e2) {
          showSidebarHint("Backend 404. Start the engagement server: cd server && node index.js (port 3000). " + (e2.message || ""));
        });
      } else {
        var msg = err.message || "";
        if (msg.indexOf("404") !== -1 || (err.status === 404)) {
          showSidebarHint("Backend returned 404. Start the engagement server on port 3000: cd server && node index.js (not the Zoom auth server on 4000).");
        } else {
          showSidebarHint("Could not load question. Is the server running at " + apiBase + "? " + msg);
        }
      }
    });
}

function bindSidebarToggle() {
  const btn = document.getElementById("sidebar-collapse-btn");
  const sidebar = document.getElementById("engagement-sidebar");
  if (!btn || !sidebar || btn.dataset.sidebarBound) return;
  btn.dataset.sidebarBound = "true";
  btn.addEventListener("click", function () {
    sidebar.classList.toggle("collapsed");
    document.body.classList.toggle("student-panel-collapsed");
    const collapsed = sidebar.classList.contains("collapsed");
    btn.textContent = collapsed ? "»" : "«";
    btn.setAttribute("aria-label", collapsed ? "Expand panel" : "Collapse panel");
    btn.title = collapsed ? "Expand panel" : "Collapse panel";
  });
}

function bindPollPopupClose() {
  const btn = document.getElementById("poll-popup-close-btn");
  if (btn && !btn.dataset.bound) {
    btn.addEventListener("click", hidePollPopup);
    btn.dataset.bound = "true";
  }
  const overlay = document.getElementById("poll-popup-overlay");
  if (overlay && !overlay.dataset.bound) {
    overlay.addEventListener("click", function (e) {
      if (e.target === overlay) hidePollPopup();
    });
    overlay.dataset.bound = "true";
  }
}

// Handle page leave
window.addEventListener("beforeunload", () => {
  document.body.classList.remove("meeting-active", "in-call", "joining");
  currentMeetingId = null;
  currentUserId = null;
  currentUserDisplayName = null;
  focusPopupShowCount = 0;
  sidebarQuizCooldownUntil = 0;
  stopEyeTracking();
  closeMeetingWebSocket();
  ZoomMtg.endMeeting({});
});