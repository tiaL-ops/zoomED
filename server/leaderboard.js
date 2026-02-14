// no llm, just backend calc
const leaderboardByMeeting = {};

export function updateLeaderboard(meetingId, answerEvent) {
  const list = (leaderboardByMeeting[meetingId] ||= []);
  let entry = list.find((e) => e.userId === answerEvent.userId);
  if (!entry) {
    entry = { userId: answerEvent.userId, displayName: answerEvent.displayName, score: 0 };
    list.push(entry);
  }
  if (answerEvent.isCorrect) {
    const base = 10;
    const bonus = Math.max(0, 5 - answerEvent.responseTimeMs / 1000);
    entry.score += base + Math.round(bonus);
  }
  // sort by score desc
  list.sort((a, b) => b.score - a.score);
  // assign ranks
  const leaderboard = list.map((e, idx) => ({ ...e, rank: idx + 1 }));
  leaderboardByMeeting[meetingId] = leaderboard;
  return { meetingId, leaderboard };
}
