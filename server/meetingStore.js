/**
 * In-memory meeting state store. Keyed by meetingId.
 * appendEvent keeps last 15 min; getWindow returns normalized snapshot.
 */

const KEEP_MS = 15 * 60 * 1000; // 15 min

const meetings = new Map();

function getOrCreateMeeting(meetingId) {
  if (!meetings.has(meetingId)) {
    meetings.set(meetingId, {
      meetingId,
      events: [],
      createdAt: Date.now(),
    });
  }
  return meetings.get(meetingId);
}

/**
 * Append an event; trim to last 15 min.
 * @param {string} meetingId
 * @param {object} event - { type, userId?, displayName?, ts?, ... }
 */
export function appendEvent(meetingId, event) {
  const meeting = getOrCreateMeeting(meetingId);
  const ts = event.ts ?? Date.now();
  meeting.events.push({ ...event, ts });
  const since = Date.now() - KEEP_MS;
  meeting.events = meeting.events.filter((e) => e.ts >= since);
}

/**
 * Normalized snapshot for the last windowSeconds.
 * Builds users[] with signals from QUIZ_RESPONSE, SELF_REPORT, GAZE, QUESTION, CHAT, JOIN/LEAVE (and PARTICIPANT_JOINED/PARTICIPANT_LEFT).
 *
 * @param {string} meetingId
 * @param {number} [windowSeconds=300]
 * @returns {{ meetingId: string, users: Array, recentTranscriptSnippets: Array, recentPolls: Array, recentQuestions: Array }}
 */
export function getWindow(meetingId, windowSeconds = 300) {
  const meeting = meetings.get(meetingId);
  const windowMs = windowSeconds * 1000;
  const since = Date.now() - windowMs;
  const events = meeting ? meeting.events.filter((e) => e.ts >= since) : [];

  const usersMap = new Map();

  for (const e of events) {
    const uid = e.userId ?? e.participant?.user_id ?? 'anonymous';
    const displayName = e.displayName ?? e.participant?.user_name ?? e.user_name ?? uid;
    if (!usersMap.has(uid)) {
      usersMap.set(uid, {
        userId: uid,
        displayName,
        signals: {
          polls_answered: 0,
          polls_missed: 0,
          chat_messages: 0,
          questions_asked: 0,
          avg_response_latency_ms: 0,
          gaze_score: null,
          self_report: null,
          video_on: true,
          _latencies: [],
          _gaze_scores: [],
        },
      });
    }
    const u = usersMap.get(uid);

    switch (e.type) {
      case 'QUIZ_RESPONSE':
      case 'QUIZ_ANSWER':
      case 'POLL_ANSWER':
        u.signals.polls_answered += 1;
        if (e.responseTimeMs != null) u.signals._latencies.push(e.responseTimeMs);
        break;
      case 'POLL_MISSED':
        u.signals.polls_missed += 1;
        break;
      case 'SELF_REPORT':
        u.signals.self_report = e.value ?? e.status ?? e.self_report;
        break;
      case 'GAZE':
      case 'CV_ATTENTION':
        const score = e.gazeScore ?? e.cv_attention_score ?? e.avgGaze;
        if (score != null) u.signals._gaze_scores.push(Number(score));
        break;
      case 'QUESTION':
        u.signals.questions_asked += 1;
        break;
      case 'CHAT':
      case 'CHAT_MESSAGE':
        u.signals.chat_messages += 1;
        break;
      case 'JOIN':
      case 'PARTICIPANT_JOINED':
      case 'MEETING_STARTED':
        // presence; optional: u.signals.joined_at = e.ts;
        break;
      case 'LEAVE':
      case 'PARTICIPANT_LEFT':
      case 'MEETING_ENDED':
        // presence
        break;
      case 'VIDEO_ON':
        u.signals.video_on = e.video_on !== false;
        break;
      default:
        break;
    }
    usersMap.set(uid, u);
  }

  const users = Array.from(usersMap.values()).map((u) => {
    const lat = u.signals._latencies;
    u.signals.avg_response_latency_ms = lat.length ? lat.reduce((a, b) => a + b, 0) / lat.length : 0;
    const gz = u.signals._gaze_scores;
    u.signals.gaze_score = gz.length ? gz.reduce((a, b) => a + b, 0) / gz.length : null;
    delete u.signals._latencies;
    delete u.signals._gaze_scores;
    return u;
  });

  const recentPolls = events.filter((e) => e.type === 'QUIZ_RESPONSE' || e.type === 'QUIZ_ANSWER' || e.type === 'POLL_ANSWER');
  const recentQuestions = events.filter((e) => e.type === 'QUESTION');
  const recentTranscriptSnippets = events
    .filter((e) => e.type === 'TRANSCRIPT' && e.text)
    .map((e) => e.text);

  return {
    meetingId,
    users,
    recentTranscriptSnippets,
    recentPolls,
    recentQuestions,
  };
}
