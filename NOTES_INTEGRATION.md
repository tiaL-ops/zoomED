# Zoom Meeting Notes Integration Guide

## Overview
The notes system is now fully integrated into your Zoom meeting interface. Participants can:
- **During the meeting**: Generate and view AI-extracted notes in real-time
- **After the meeting**: Continue refining and exploring notes with AI assistance

## Architecture

### Flow:
1. **Meeting Transcript** → Sent to backend via `/api/events` (type: `TRANSCRIPT_UPDATE`)
2. **Notes Generation** → `notesExtractorAgent` creates knowledge graph
3. **Real-time Display** → Notes panel in Zoom shows key concepts
4. **Interactive Refinement** → Users ask AI to add/modify concepts

## How to Use

### During Meeting:
1. Join a Zoom meeting from the Zoom app (localhost:8080)
2. Click **"Generate Notes"** button in the notes panel (right side)
3. AI extracts key points from meeting transcript
4. Click on any concept to see:
   - Detailed summary
   - Supporting details
   - Connections to other concepts

### After Meeting:
1. Notes persist and can be refined further
2. Use the chat interface to:
   - Add new concepts
   - Modify relationships
   - Ask follow-up questions
3. Notes auto-save to the backend

## Integration Points

### Frontend (Zoom App)
- **File**: `zoomapp/app.js`
- **UI**: Notes panel beside Zoom meeting video
- **Functions**:
  - `generateNotesFromMeeting()` - Triggers note generation
  - `displayNotes()` - Renders notes in panel
  - `expandKeyPoint()` - Shows detailed view

### Backend (Express)
- **File**: `server/index.ts`
- **Endpoints**:
  - `POST /api/generate-notes` - Generate from transcript
  - `GET /api/notes/:meetingId` - Retrieve notes
  - `POST /api/notes/:meetingId/chat` - Refine notes
  - `POST /api/events` - Store transcript snippets

### AI Agents
- **File**: `server/agents.ts`
- **Agents**:
  - `notesExtractorAgent` - Creates knowledge graphs
  - `agentNotesChatAgent` - Refines existing notes

## Technical Details

### Notes Structure
```typescript
{
  title: string;
  summary: string;
  key_points: [{
    id: string;
    title: string;
    summary: string;
    details: string[];
    importance: "high" | "medium" | "low";
    timestamp?: string;
  }];
  associations: [{
    from_id: string;
    to_id: string;
    relationship_type: string;
    description: string;
  }];
  tags: string[];
}
```

### Relationship Types
- `prerequisite` - Concept A must be understood before B
- `related` - Concepts are connected
- `contradicts` - Concepts oppose each other
- `example_of` - Concept A is an example of B
- `expands_on` - Concept A provides more detail about B

## Data Flow During Meeting

1. Zoom captures audio/transcript
2. Send to backend: `POST /api/events` with `TRANSCRIPT_UPDATE`
3. Backend stores in `transcriptSnippets` array
4. Frontend clicks "Generate Notes"
5. Backend calls Claude API with full transcript
6. Returns structured knowledge graph
7. Frontend displays in notes panel
8. User can click concepts to explore

## Sending Transcripts

From your Zoom app, send transcript data:

```javascript
// Example: Send transcript update
fetch('http://localhost:3000/api/events', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    meetingId: '89247964461',
    type: 'TRANSCRIPT_UPDATE',
    speaker: 'John',
    text: 'Today we will discuss machine learning...',
    timestamp: '00:05:30'
  })
});
```

## UI Layout

```
┌─────────────────────────────────┬──────────────┐
│                                 │   📝 Notes   │
│     Zoom Meeting Video          │──────────────│
│     (Main participant view)      │[Generate]   │
│                                 │              │
│                                 │ Summary     │
│                                 │ - Point 1   │
│                                 │ - Point 2   │
│                                 │ - Point 3   │
│                                 │              │
└─────────────────────────────────┴──────────────┘
```

## Responsive Design

- **Desktop**: Notes panel fixed on right side
- **Tablet**: Notes panel below video
- **Mobile**: Full-width notes (expandable)

## Next Steps / Enhancements

1. **Real-time Transcripts**: Integrate with Zoom's live transcript API
2. **Speaker Recognition**: Attribute notes to specific speakers
3. **Export**: Save notes as PDF/Markdown
4. **Collaboration**: Multiple users editing notes in real-time
5. **Topic Detection**: Auto-detect when topics change and break notes
6. **Follow-up Questions**: AI generates quiz questions from notes
