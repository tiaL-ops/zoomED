# 🎯 Zoom Engagement Tool - Notes Integration

Complete integration of AI-powered notes generation into Zoom meetings with knowledge graph visualization and real-time refinement.

## Quick Start

### 1. Start Backend Server
```bash
cd server
npm install
node index.js
```
Server runs on `http://localhost:3000`

### 2. Start Zoom App
```bash
cd zoomapp/meetingsdk-auth-endpoint-sample
npm install
npm start
# In another terminal:
cd zoomapp
npx serve -p 8080
```
Open `http://localhost:8080` to join a meeting

### 3. Simulate Meeting Transcript (for testing)
```bash
cd server
# Compile TypeScript if needed, or use tsx:
npx tsx transcript-simulator.ts machine-learning test-meeting-001
```

This sends sample transcript segments to the backend for the meeting `test-meeting-001`.

### 4. Generate Notes in Zoom App
1. Join meeting at `http://localhost:8080`
2. Meeting ID: `89247964461` (or any ID)
3. Wait for meeting to load
4. Click **"Generate Notes"** button in the right panel
5. Notes appear with key concepts

## Features

### 🎓 Knowledge Graph
- Automatic concept extraction from transcripts
- Visual representation of key points
- Importance levels (high/medium/low)
- Timestamps for each concept

### 🔗 Association Network
- Prerequisite relationships
- Related concepts
- Contradictions
- Examples and expansions

### 💬 AI Refinement
- Chat-based note editing
- Add new concepts
- Modify relationships
- Ask follow-up questions

### 📱 Responsive UI
- Desktop: Side panel
- Tablet: Bottom panel
- Mobile: Expandable panel

## Architecture

```
┌──────────────────────────────────────────────────┐
│ Zoom App (Frontend)                              │
│ ├─ app.js: Meeting + Notes Panel               │
│ └─ Notes Integration                             │
│    ├─ Generate Notes (Backend API call)         │
│    ├─ Display Knowledge Graph                   │
│    └─ Interactive Node Selection                │
└────────────┬─────────────────────────────────────┘
             │ HTTP/REST
             ↓
┌──────────────────────────────────────────────────┐
│ Express Backend (server/index.ts)                │
│ ├─ POST /api/events (Transcript storage)        │
│ ├─ POST /api/generate-notes (AI generation)     │
│ ├─ GET /api/notes/:meetingId (Retrieval)       │
│ └─ POST /api/notes/:meetingId/chat (Refine)    │
└────────────┬─────────────────────────────────────┘
             │ Claude API
             ↓
┌──────────────────────────────────────────────────┐
│ Claude AI Agents (server/agents.ts)              │
│ ├─ notesExtractorAgent (Create knowledge graph) │
│ └─ agentNotesChatAgent (Refine notes)          │
└──────────────────────────────────────────────────┘
```

## API Endpoints

### Send Transcript Segment
```http
POST /api/events
Content-Type: application/json

{
  "meetingId": "89247964461",
  "type": "TRANSCRIPT_UPDATE",
  "speaker": "Instructor",
  "text": "Today we'll discuss machine learning...",
  "timestamp": "00:05:30"
}
```

### Generate Notes from Meeting
```http
POST /api/generate-notes
Content-Type: application/json

{
  "meetingId": "89247964461",
  "userConversation": ""
}

Response:
{
  "ok": true,
  "notes": {
    "title": "Meeting Summary",
    "summary": "...",
    "key_points": [...],
    "associations": [...],
    "tags": [...]
  }
}
```

### Retrieve Notes
```http
GET /api/notes/89247964461

Response:
{
  "ok": true,
  "notes": { ... }
}
```

### Refine Notes via Chat
```http
POST /api/notes/89247964461/chat
Content-Type: application/json

{
  "query": "Add a concept about supervised learning"
}

Response:
{
  "ok": true,
  "notes": { ... }
}
```

## Data Structure

### Key Point
```typescript
{
  id: "kp1";
  title: "Machine Learning Basics";
  summary: "Brief explanation of ML";
  details: ["Detail 1", "Detail 2"];
  importance: "high" | "medium" | "low";
  timestamp?: "00:05:30";
}
```

### Association
```typescript
{
  from_id: "kp1";
  to_id: "kp2";
  relationship_type: "prerequisite" | "related" | "contradicts" | "example_of" | "expands_on";
  description: "How concepts connect";
}
```

### Meeting Notes
```typescript
{
  title: string;
  summary: string;
  key_points: KeyPoint[];
  associations: Association[];
  tags: string[];
  generatedAt: string;
  updatedAt?: string;
}
```

## Testing

### Test with Simulated Transcript
```bash
# Terminal 1: Start backend
cd server && node index.js

# Terminal 2: Simulate transcript
npx tsx transcript-simulator.ts machine-learning test-meeting-001

# Terminal 3: Start Zoom app
cd zoomapp/meetingsdk-auth-endpoint-sample && npm start
cd zoomapp && npx serve -p 8080
```

### Test Flow
1. Simulator sends 15+ transcript segments
2. Open `http://localhost:8080`
3. Enter Meeting ID: `test-meeting-001`
4. Join meeting
5. Click "Generate Notes"
6. Explore key concepts and connections

### Test Different Topics
```bash
# Available topics: machine-learning, data-science, web-development
npx tsx transcript-simulator.ts data-science demo-meeting-001
npx tsx transcript-simulator.ts web-development demo-meeting-002
```

## Integration with Zoom Engagement Features

### Current Multi-Agent System
- ✅ Engagement Summarizer: Monitors eye contact & poll engagement
- ✅ Quiz Poll Generator: Creates and deploys quizzes
- ✅ Meeting Coordinator: Makes engagement decisions
- ✅ **NEW** Notes Extractor: Converts transcripts to knowledge graphs
- ✅ **NEW** Notes Chat Agent: Refines notes conversationally

### Event Types
```typescript
type Event =
  | "TRANSCRIPT_UPDATE" // New: transcript segment
  | "QUIZ_ANSWER" // Existing: quiz response
  | "CHAT_MESSAGE" // Existing: chat message
  | "POLL_RESPONSE" // Existing: poll response
  | "CV_ATTENTION" // Existing: eye contact data
  | "VIDEO_STATUS"; // Existing: video on/off
```

## Performance Tips

### For Large Transcripts
- Break into 30-50 segments max
- Send with 100-200ms delays between segments
- Use timestamps to maintain chronological order

### API Rate Limiting
- Claude API: Default limits apply
- Backend: No rate limiting (add in production)
- WebSocket: Auto-reconnect enabled

### Storage
- In-memory (hackathon-safe)
- Production: Add MongoDB/PostgreSQL
- Cache: Redis for frequently accessed notes

## Troubleshooting

### Notes not generating
- ✓ Check backend is running on port 3000
- ✓ Verify `CLAUDE_API_KEY` environment variable
- ✓ Check browser console for errors
- ✓ Ensure transcript data was sent via `/api/events`

### Meeting won't join
- ✓ Verify Meeting ID is correct
- ✓ Check Zoom auth server on port 4000
- ✓ Confirm passcode if required
- ✓ Try joining as attendee first

### Panel not showing
- ✓ Refresh page
- ✓ Clear browser cache
- ✓ Check viewport is wide enough (400px minimum)
- ✓ Toggle with close button

## Browser Compatibility
- Chrome/Edge: ✅ Full support
- Firefox: ✅ Full support
- Safari: ✅ Full support
- Mobile: ✅ Responsive design

## Environment Variables
```bash
# .env (server)
CLAUDE_API_KEY=your_key_here
NODE_ENV=development
```

## Next Steps

1. **Real-time Transcripts**: Integrate Zoom's live transcript API
2. **Speaker Detection**: Attribute concepts to speakers
3. **Export**: PDF/Markdown download
4. **Collaboration**: Multi-user editing
5. **Analytics**: Track key topics and trends
6. **Quiz Generation**: Auto-create questions from notes
7. **Mobile App**: Native mobile version

## License
MIT

## Support
For issues or questions, check the main README.md
