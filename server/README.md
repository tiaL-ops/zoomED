# Server

Node/Express backend with WebSocket support. Implements server, WebSocket, and multi-agent engagement logic.

## Multi-Agent System

**Per-participant orchestration**: agents run in parallel chains to deliver personalized engagement interventions (nudges, quizzes) for each low-engagement participant.

### Flow

1. **engagementSummarizerAgent** — Analyzes all participants, builds per-participant contexts.
2. **Filter** — Selects participants needing help (`engagement === 1` or `needsAttention`).
3. **Parallel chains** — For each: **nudgeAgent** → (optionally) **quizPollAgent**.
4. **Aggregate** — Combined nudges, quizzes, and per-participant outcomes.

### Context

- **Class context** (shared): meetingId, meetingType, currentTopic, recentTranscript, class engagement.
- **Participant context** (per person): userId, displayName, engagement, signals (polls, chat, attention), needsAttention.

### Usage

**Orchestrator (recommended):**
```javascript
const result = await orchestrateEngagementSystem(meeting, { meetingType: 'education' });
// result.nudges, result.quizzes, result.interventions
```

**API:** `POST /api/orchestrate` with body `{ "meetingId": "meeting-123" }`.

**Test:** `node test-orchestrator.js`

### Features

- Per-participant chains with isolated context  
- Parallel processing via `Promise.all()`  
- Conditional chaining (nudgeAgent decides if quiz runs)  
- Error isolation (one failed chain doesn’t affect others)  
- Backward compatible with individual agent calls  

### Implementation Notes

- **agents.js**: `executeParticipantChain()`, `orchestrateEngagementSystem()`; engagementSummarizerAgent returns `participantContexts`; nudgeAgent/quizPollAgent accept single-participant + class context.
- **index.js**: `POST /api/orchestrate` runs orchestration, broadcasts to clients, stores in meeting state.

For full architecture, context schemas, and future enhancements see **MULTI_AGENT_GUIDE.md** and **IMPLEMENTATION_SUMMARY.md**.
