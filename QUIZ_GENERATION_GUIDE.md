# Quick Reference: Caption → Quiz Generation Pipeline

## 🎯 What's Wired Up

```
Zoom Meeting
    ↓
[Instructor teaches, captions captured]
    ↓
Zoom SDK: ZoomIntl.LiveCaptions.onCaptionUpdate()
    ↓
[Captions streamed to backend]
    ↓
POST /api/transcript
    ↓
meeting.recentTranscriptSnippets[]
    ↓
orchestrateEngagementSystem()
    ↓
engagementSummarizerAgent
    ↓
[Identifies low-engagement students]
    ↓
Per-student chains (parallel):
  ├─ nudgeAgent (creates supportive message)
  └─ quizPollAgent (generates questions BASED ON LESSON CONTENT)
    ↓
Broadcast to frontend
```

## 🚀 How to Use

### Option 1: In Zoom App (Real-time)

```javascript
// zoomapp/app.js
import { startCompleteFlow } from './COMPLETE_INTEGRATION.js';

// During app init
const context = ZoomIntl.getContext();
await startCompleteFlow(context.meetingID);

// That's it! Captions → Quizzes happens automatically every 10 seconds
```

### Option 2: Manual Testing

```bash
# Test the entire pipeline
node server/test-wiring.js
```

### Option 3: Via API

```bash
# 1. Set topic
curl -X POST http://localhost:3000/api/topic \
  -H "Content-Type: application/json" \
  -d '{"meetingId":"meeting-123", "topic":"Newton Laws"}'

# 2. Send caption
curl -X POST http://localhost:3000/api/transcript \
  -H "Content-Type: application/json" \
  -d '{
    "meetingId":"meeting-123",
    "displayName":"Dr Smith",
    "text":"An object at rest stays at rest unless acted upon",
    "topic":"Newton Laws"
  }'

# 3. Send student event
curl -X POST http://localhost:3000/api/events \
  -H "Content-Type: application/json" \
  -d '{
    "meetingId":"meeting-123",
    "userId":"student-1",
    "displayName":"Alice",
    "type":"ATTENTION_SCORE",
    "cv_attention_score":0.2
  }'

# 4. Generate quizzes based on content
curl -X POST http://localhost:3000/api/orchestrate \
  -H "Content-Type: application/json" \
  -d '{"meetingId":"meeting-123"}'

# Result will include:
# - nudges: Personalized messages for low-engagement students
# - quizzes: Questions based on what was just taught
```

## 📊 Data Flow

### Input (Zoom Captions → Backend)
```json
{
  "meetingId": "meeting-123",
  "displayName": "Dr. Smith",
  "text": "Newton's first law states that an object at rest...",
  "topic": "Newton's Laws of Motion",
  "timestamp": 1707974400000
}
```

### Stored In
```javascript
meeting.recentTranscriptSnippets = [
  { displayName, text, timestamp },
  { displayName, text, timestamp },
  ...
]

meeting.currentTopic = "Newton's Laws of Motion"
```

### Passed To Agents
```javascript
classContext = {
  meetingId,
  currentTopic: "Newton's Laws of Motion",
  recentTranscript: "Newton's first law... object at rest...",
  class_engagement: 2,
  summary: "..."
}
```

### Quiz Agent Receives
```javascript
const transcriptSnippet = classContext.recentTranscript
// → "Newton's first law states that an object at rest..."

const topic = classContext.currentTopic
// → "Newton's Laws of Motion"

const difficulty = participantContext.engagement
// → 1 (low engagement) means basic questions
```

### Output (Generated Quizzes)
```json
{
  "userId": "student-2",
  "topic": "Newton's Laws of Motion",
  "difficulty": 1,
  "questions": [
    {
      "id": "q1",
      "type": "mcq",
      "question": "According to Newton's first law, what happens to an object at rest?",
      "options": [
        "It accelerates",
        "It stays at rest unless acted upon by an external force",
        "It moves in a circle",
        "It speeds up"
      ],
      "correctIndex": 1
    }
  ],
  "encouragement": "Great effort on keeping up! Let's check your understanding..."
}
```

## ✅ Verification Checklist

- [ ] Zoom app imports `CAPTION_INTEGRATION.js`
- [ ] `setupLiveCaptionListener()` called during app init
- [ ] Captions appear in server logs: `[Transcript] Caption received`
- [ ] Endpoint `/api/orchestrate` called (manually or via timer)
- [ ] Agent orchestrator runs: `[Orchestrator] Starting multi-agent engagement system...`
- [ ] Nudges generated for low-engagement students
- [ ] Quizzes contain questions about the lesson content
- [ ] Quiz difficulty matches student engagement level

## 🧪 Test Scenarios

### Scenario 1: Low Engagement Student
```
1. Student has cv_attention_score = 0.2 (low)
2. Student misses quiz attempts
3. Orchestrator runs
4. nudgeAgent creates supportive message
5. quizPollAgent creates BASIC questions about lesson
6. Quiz specifically for this student, encouraging tone
```

### Scenario 2: Content-Based Questions
```
1. Instructor teaches: "Force equals mass times acceleration"
2. Caption captured: "F = ma"
3. Quiz agent generates questions about F=ma
4. Students answer questions about the content just taught
```

### Scenario 3: Parallel Chains
```
1. Multiple low-engagement students identified
2. Each gets their own chain (parallel execution)
3. Each gets personalized nudge + quiz
4. All happens in ~2-3 seconds
5. All results aggregated and sent to frontend
```

## 📁 Key Files

```
server/
  ├── index.js                    ← Backend with /api/transcript, /api/orchestrate
  ├── agents.js                   ← Quiz agent with lesson context
  └── test-wiring.js              ← Run this to verify everything

zoomapp/
  ├── CAPTION_INTEGRATION.js      ← Zoom SDK integration
  ├── COMPLETE_INTEGRATION.js     ← Full pipeline orchestration
  └── app.js                      ← Import and call setupLiveCaptionListener()
```

## 🐛 Debugging

### Check captions are flowing:
```javascript
// In browser console of Zoom app:
// Should see: [Transcript] Caption received: ...
```

### Check backend received them:
```bash
# In server logs:
# [Transcript] Caption received: { ... }
# [Topic] Meeting X topic set to: Newton's Laws
```

### Check quiz generation:
```bash
# Run test
node server/test-wiring.js

# Should see generated quizzes with lesson content
```

### Manual trigger:
```javascript
// In zoomapp console:
import { manuallyTriggerOrchestration } from './COMPLETE_INTEGRATION.js';
await manuallyTriggerOrchestration('meeting-123');
// Check console for output
```

## 🎓 Example Output

When a student is disengaged and has low attention during Newton's Laws lesson:

**Nudge:**
```
"Hey there! When you get a moment, we'd love to have you join us. 
No rush—rejoin when you're ready. 👋"
```

**Quiz (Difficulty 1 - Basic):**
```
Question 1: What did Newton's first law say about objects at rest?
a) They always accelerate
b) They stay at rest unless acted upon by an external force ✓
c) They move in circles
d) They disappear

Encouragement: "Great job checking in! Let's reinforce what we just covered..."
```

The quiz is **automatically based on the lesson content** (Newton's Laws) captured from captions!
