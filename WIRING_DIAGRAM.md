# Visual Wiring Diagram: Caption → Quiz Generation

## Complete Data Flow

```
┌──────────────────────────────────────────────────────────────────────────┐
│                          ZOOM MEETING IN PROGRESS                         │
│                                                                            │
│  Instructor: "Newton's first law states that an object at rest stays     │
│               at rest unless acted upon by an external force."           │
└──────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌──────────────────────────────────────────────────────────────────────────┐
│                         ZOOM LIVE CAPTION CAPTURE                         │
│                                                                            │
│  ZoomIntl.LiveCaptions.onCaptionUpdate({                                 │
│    userID: 'instructor-1',                                               │
│    userName: 'Dr. Smith',                                                │
│    caption: "Newton's first law states that an object at rest stays..."  │
│  })                                                                       │
└──────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌──────────────────────────────────────────────────────────────────────────┐
│                      ZOOM APP (CAPTION_INTEGRATION.js)                    │
│                                                                            │
│  setupLiveCaptionListener() → onCaptionUpdate → fetch POST               │
└──────────────────────────────────────────────────────────────────────────┘
                                    ↓
          ┌─────────────────────────┴──────────────────────────┐
          │                                                    │
          ▼                                                    ▼
    ┌──────────────┐                               ┌──────────────────┐
    │  /api/topic  │                               │ /api/transcript  │
    │ (optional)   │                               │ (captions)       │
    │              │                               │                  │
    │ POST {       │                               │ POST {           │
    │  topic: "   │                               │  meetingId: "m1" │
    │   Newton.." │                               │  text: "Newton's"│
    │ }           │                               │  topic: "Newton" │
    └──────────────┘                               └──────────────────┘
          │                                                    │
          └─────────────────────────┬──────────────────────────┘
                                    ↓
                    ┌───────────────────────────────┐
                    │    BACKEND STATE STORAGE      │
                    │                               │
                    │  meetingState[meetingId] = { │
                    │    currentTopic: "Newton's...",
                    │    recentTranscriptSnippets: [
                    │      {                       │
                    │        text: "Newton's first │
                    │               law states..." │
                    │        displayName: "Dr...."  │
                    │        timestamp: 1707...    │
                    │      },                      │
                    │      { ...more captions... } │
                    │    ],                        │
                    │    events: [                 │
                    │      { student engagement    │
                    │        data...             } │
                    │    ]                        │
                    │  }                          │
                    └───────────────────────────────┘
                                    ↓
           ┌────────────────────────┴─────────────────────────┐
           │                                                  │
     [Manual Trigger]                                   [Auto Trigger]
     POST /api/tick                                  Every 10 seconds
           │                                                  │
           └────────────────────────┬─────────────────────────┘
                                    ↓
                    ┌───────────────────────────────┐
                    │  orchestrateEngagementSystem  │
                    │                               │
                    │  1. Analyze all students      │
                    │  2. Create classContext {     │
                    │       recentTranscript:       │
                    │       "Newton's first law..." │
                    │       currentTopic:           │
                    │       "Newton's Laws"         │
                    │     }                         │
                    │  3. Identify low-engagement   │
                    │  4. Fan out to parallel       │
                    │     chains                    │
                    └───────────────────────────────┘
                                    ↓
        ┌───────────────────────────┴────────────────────────┐
        │                                                    │
        ▼                                                    ▼
    Student: Bob                                      Student: Charlie
  (engagement: 1)                                   (engagement: 1)
        │                                                    │
        ├─ nudgeAgent()                                      ├─ nudgeAgent()
        │  ↓                                                 │  ↓
        │  Message:                                         │  Message:
        │  "Hey Bob, we'd love to                           │  "Charlie, when
        │   have you with us!"                              │   you're ready!"
        │                                                    │
        ├─ quizPollAgent()                                  └─ quizPollAgent()
        │  ↓                                                    ↓
        │  Input:                                          Input:
        │  - participantContext (Bob's data)               - participantContext
        │  - classContext:                                 - classContext:
        │    {                                              {
        │      recentTranscript:                             recentTranscript:
        │      "Newton's first law states...",              "Newton's first...",
        │      currentTopic: "Newton's Laws",               currentTopic:
        │      class_engagement: 2                          "Newton's Laws",
        │    }                                               class_engagement: 2
        │  - difficulty: 1 (low engagement)                }
        │                                                   - difficulty: 1
        │  ↓                                                   ↓
        │  Claude API:                                     Claude API:
        │  "Generate basic questions about                 "Generate basic
        │   Newton's Laws based on the                      questions about
        │   transcript provided"                            Newton's Laws..."
        │  ↓                                                   ↓
        │  Output:                                         Output:
        │  {                                               {
        │    userId: "bob",                                userId: "charlie",
        │    topic: "Newton's Laws",                       topic: "Newton's...",
        │    difficulty: 1,                                difficulty: 1,
        │    questions: [                                  questions: [
        │      {                                             {
        │        id: "q1",                                    id: "q1",
        │        type: "mcq",                                type: "mcq",
        │        question: "What does                        question: "What
        │        Newton's first law state?",                does Newton's first",
        │        options: [                                  options: [
        │          "It accelerates",                         "Stays at rest",
        │          "Stays at rest unless                     "Always moves",
        │           acted upon by force" ← BASED ON          ...
        │                                   ACTUAL LESSON!   
        │          "Moves in circle",
        │          "Speeds up"
        │        ],
        │        correctIndex: 1
        │      },
        │      { more questions... }
        │    ],
        │    encouragement: "Great effort!"
        │  }
        │
        └────────────────────────┬──────────────────────────┘
                                 ↓
                    ┌────────────────────────────┐
                    │   AGGREGATE RESULTS        │
                    │                            │
                    │  {                         │
                    │    nudges: [               │
                    │      { Bob nudge },        │
                    │      { Charlie nudge }     │
                    │    ],                      │
                    │    quizzes: [              │
                    │      { Bob quiz },         │
                    │      { Charlie quiz }      │
                    │    ],                      │
                    │    summary: {              │
                    │      classEngagement: 2,   │
                    │      participantsHelped: 2 │
                    │    }                       │
                    │  }                         │
                    └────────────────────────────┘
                                 ↓
           ┌─────────────────────┴──────────────────────┐
           │                                            │
        [Broadcast via WebSocket]             [Return via API]
           │                                            │
           ▼                                            ▼
    ┌───────────────────────────┐              ┌──────────────────┐
    │  STUDENTS IN ZOOM MEETING │              │ Frontend/App API │
    │                           │              │ Response         │
    │  Bob sees:                │              │                  │
    │  ├─ Nudge popup:          │              │ Status: 200      │
    │  │  "We'd love to have    │              │ Body: {          │
    │  │   you with us!"        │              │   nudges: [...],  │
    │  │                        │              │   quizzes: [...]  │
    │  └─ Quiz appears:         │              │ }                │
    │    Q: "What does Newton's │              └──────────────────┘
    │       first law state?"   │
    │    a) It accelerates      │
    │    b) Stays at rest       │
    │       unless acted upon ✓ │
    │    c) Moves in circle     │
    │    d) Speeds up           │
    │                           │
    │  Charlie sees same        │
    │  but with their own       │
    │  personalized content     │
    └───────────────────────────┘
```

## Key Connection Points

### Point 1: Caption Capture
```
ZOOM LIVE CAPTION → ZoomIntl.LiveCaptions.onCaptionUpdate()
                 → fetch /api/transcript
```

### Point 2: Context Creation
```
/api/transcript POST → meetingState[meetingId].recentTranscriptSnippets
                    → meetingState[meetingId].currentTopic
```

### Point 3: Context Passing
```
orchestrateEngagementSystem(meeting)
→ engagementSummarizerAgent(meeting)
→ executeParticipantChain(participant, classContext)
  → nudgeAgent(participant, classContext)
  → quizPollAgent(participant, classContext {
      recentTranscript: "Newton's first law...",
      currentTopic: "Newton's Laws",
      class_engagement: 2,
      ...
    })
```

### Point 4: Content-Based Generation
```
quizPollAgent receives:
{
  classContext.recentTranscript,
  classContext.currentTopic,
  participant.engagement
}

Claude prompt:
"Generate ${difficulty} questions about ${topic}
 based on this transcript: ${transcriptSnippet}"

Output: Questions specifically about Newton's Laws
```

### Point 5: Result Broadcasting
```
orchestrateEngagementSystem returns {
  nudges: [ { message, reason, ... }, ... ],
  quizzes: [ { questions, topic, ... }, ... ]
}

→ Broadcast via WebSocket to students
→ Students see personalized nudges + content-based quizzes
```

## Time Sequence

```
0s      Instructor starts speaking about Newton's Laws
        "Newton's first law states..."
        ↓
0.1s    Zoom captures caption
        ↓
0.2s    Caption listener fires onCaptionUpdate()
        ↓
0.3s    POST /api/transcript sent
        ↓
0.5s    Caption stored in meeting.recentTranscriptSnippets
        ↓
10s     Auto-orchestration timer fires
        ↓
10.1s   orchestrateEngagementSystem() starts
        ↓
10.2s   engagementSummarizerAgent analyzes engagement
        ↓
10.3s   Low-engagement students identified
        ↓
10.5s   nudgeAgent generates messages (parallel)
        ↓
10.8s   quizPollAgent generates questions (parallel)
        ↓
11s     Results broadcast to students
        ↓
11.1s   Students see nudge + quiz based on Newton's Laws
```

## Summary

The system is **fully connected** such that:

1. ✅ Zoom captions flow to backend
2. ✅ Backend stores captions + topic
3. ✅ Orchestrator creates classContext with captions
4. ✅ Quiz agent receives captions + topic
5. ✅ Quiz agent generates content-specific questions
6. ✅ Questions are personalized by difficulty
7. ✅ Results broadcast to students in real-time

**Everything is wired for automatic caption → quiz generation!** 🎉
