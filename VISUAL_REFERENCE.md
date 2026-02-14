# Visual Integration Reference

## Screen Layout During Meeting

```
┌─────────────────────────────────────────────────────────────┐
│ Zoom App - TreeHacks Engagement Tool                        │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────────────────────────┐  ┌────────────────┐  │
│  │                                  │  │   📝 AI Notes  │  │
│  │                                  │  ├────────────────┤  │
│  │      Zoom Meeting Video          │  │   [Generate]   │  │
│  │      • Participant Video         │  │                │  │
│  │      • Screen Share              │  │ ✓ Summary      │  │
│  │      • Meeting Controls          │  │   ...meeting   │  │
│  │                                  │  │   ...overview  │  │
│  │                                  │  │                │  │
│  │                                  │  │ Key Concepts:  │  │
│  │                                  │  │ • [ML Basics]  │  │
│  │                                  │  │ • [Supervised] │  │
│  │                                  │  │ • [Neural Nets]│  │
│  │                                  │  │ • [Training]   │  │
│  │                                  │  │                │  │
│  │                                  │  │ Connection:    │  │
│  │                                  │  │ > prerequisite │  │
│  │                                  │  │                │  │
│  │                                  │  │ [Refine with AI]│ │
│  │                                  │  │ [✕ Close]      │  │
│  └──────────────────────────────────┘  └────────────────┘  │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## Knowledge Graph Example

```
Concept Relationships Visualization:

                    Machine Learning (HIGH IMPORTANCE)
                            │
                ┌───────────┼───────────┐
                │           │           │
           prerequisite     │        related
                │           │           │
                ↓           ↓           ↓
         Supervised    Unsupervised   Statistics
         Learning      Learning
                │           │
            example_of   example_of
                │           │
                ↓           ↓
           Linear Reg.   K-Means
         Decision Tree   Clustering
```

## User Interaction Flow

```
User Joins Meeting
        ↓
┌───────────────────┐
│ Notes Panel Ready │
│ [Generate Notes]  │ ← Click here
└────────┬──────────┘
         ↓
    Fetching from backend...
         ↓
    Claude AI processes transcript (3-8s)
         ↓
┌─────────────────────────────┐
│ ✓ Notes Generated           │
│ Summary: ...                │
│                             │
│ Key Concepts:               │
│ • [Concept 1] (HIGH)        │ ← Click to expand
│ • [Concept 2] (MEDIUM)      │
│ • [Concept 3] (LOW)         │
└────────┬────────────────────┘
         ↓
User clicks concept
         ↓
┌──────────────────────────────┐
│ Concept Details Expand       │
│ Title: Supervised Learning   │
│ Summary: ...                 │
│ Details:                     │
│ → Uses labeled training data │
│ → Learns input→output map    │
│                              │
│ Connections:                 │
│ [prerequisite] of Neural...  │
│ [related] to Classification  │
│                              │
│ [Ask AI to modify]           │
└──────────────────────────────┘
         ↓
(Optional) Refine with chat
         ↓
AI updates knowledge graph
```

## Component Architecture

```
Frontend Layers:
┌────────────────────────────────┐
│   Zoom Meeting SDK             │
│   (Video, Audio, Screen Share) │
└────────────────────────────────┘
         ↓
┌────────────────────────────────┐
│   Notes Panel (UI)             │
│  ┌──────────────────────────┐  │
│  │ Header + Close Button    │  │
│  │ Generate Button          │  │
│  │ Content Area             │  │
│  │ • Summary                │  │
│  │ • Key Points Grid        │  │
│  │ • Detail View            │  │
│  │ • Connection List        │  │
│  │ • Chat Input             │  │
│  └──────────────────────────┘  │
└────────────────────────────────┘
         ↓ (REST API)
┌────────────────────────────────┐
│   Express Backend              │
│  • Event Storage              │
│  • Note Generation            │
│  • Chat Refinement            │
│  • WebSocket Broadcast        │
└────────────────────────────────┘
         ↓ (API Calls)
┌────────────────────────────────┐
│   Claude AI Agents             │
│  • Notes Extractor            │
│  • Chat Refiner               │
└────────────────────────────────┘
```

## Data Flow Timeline

```
DURING MEETING:

Time    Event
─────────────────────────────────
0:00    User joins meeting
0:30    Transcript segments sent (per 5 min or manual)
1:00    Backend accumulates transcript data
1:30    User clicks "Generate Notes" button
2:00    Request sent to backend /api/generate-notes
2:15    Claude AI processes transcript
2:45    AI returns knowledge graph JSON
2:50    Notes rendered in panel
3:00    User sees key concepts and connections
3:30    (Optional) User clicks concept to expand
4:00    (Optional) User asks AI to add concept
4:10    AI updates notes
4:15    Updated notes displayed
[continues until meeting ends]


AFTER MEETING:

Meeting Ends
    ↓
Notes persist in browser
    ↓
User can still:
├─ Explore concepts
├─ Ask AI to refine
├─ Export (future)
└─ Archive (future)
```

## Color Coding System

```
Importance Levels:
┌─────────────────────────┐
│ HIGH (Red accent)       │ Critical concepts
│ ████████████████████    │ Must understand
├─────────────────────────┤
│ MEDIUM (Orange accent)  │ Important
│ ████████████            │ Should know
├─────────────────────────┤
│ LOW (Green accent)      │ Supporting
│ ████                    │ Nice to know
└─────────────────────────┘

Relationship Colors:
• Prerequisite → Purple
• Related → Blue
• Example → Green
• Contradicts → Red
• Expands On → Yellow
```

## State Transitions

```
States during meeting:

[Joined] ──→ [Panel Ready] ──→ [Generating] ──→ [Displaying]
               ↑                                      ↓
               └──────────── [Idle] ←───────────────┘
                              ↑
                              └─ [Refining]
                                 ↑
                              (Chat active)
```

## Performance Visualization

```
Time to Generate Notes:

0%    20%   40%   60%   80%   100%
├─────────┼─────────┼─────────┼─────────┤
  Upload   Backend  Claude    Render
  1-2s     0.5s    4-6s      0.5s

Total: ~6-9 seconds
```

## Responsive Breakpoints

```
Desktop (>1200px):
┌─────────────────────────────────────┐
│              │  400px Notes Panel   │
│ Video (1fr) │                      │
│              │  Fully visible       │
└─────────────────────────────────────┘

Tablet (768-1200px):
┌────────────────────────┐
│    Video (1fr)  │Notes │ (300px)
└────────────────────────┘

Mobile (<768px):
┌──────────────────┐
│   Video          │
├──────────────────┤
│  Notes (expandable)
└──────────────────┘
```

## Integration Points with Multi-Agent System

```
User Actions in Meeting:
├─ Speaks          → Transcript captured
├─ Takes quiz      → Quiz agent processes
├─ Answers poll    → Engagement tracked
├─ Makes eye contact → CV attention recorded
└─ (NEW) Generate notes → Notes agent processes

All Events Flow:
        ↓
    Event Bus
        ↓
    Multi-Agent System
        ├─ Engagement Summary
        ├─ Meeting Coordinator
        ├─ Quiz Generator
        └─ (NEW) Notes Extractor
        ↓
    Decision Making
        ↓
    WebSocket Broadcast
        ↓
    Frontend Updates
        ├─ Leaderboard
        ├─ Engagement Meter
        ├─ Polls
        └─ (NEW) Notes Panel
```

## API Response Structure

```
Request:
POST /api/generate-notes
{
  "meetingId": "12345",
  "userConversation": ""
}

Response:
{
  "ok": true,
  "notes": {
    "title": "...",
    "summary": "...",
    "key_points": [
      {
        "id": "kp1",
        "title": "...",
        "summary": "...",
        "details": [...],
        "importance": "high",
        "timestamp": "00:05:30"
      }
    ],
    "associations": [
      {
        "from_id": "kp1",
        "to_id": "kp2",
        "relationship_type": "prerequisite",
        "description": "..."
      }
    ],
    "tags": [...],
    "generatedAt": "2026-02-14T..."
  }
}
```

## Error Handling Flow

```
API Request
    ↓
❌ Error? 
    ├─ Network error → Show "Connection failed"
    ├─ API error → Show Claude error message
    ├─ Validation error → Show "Invalid input"
    └─ Timeout → Show "Request took too long"
        ↓
    Retry button shown
    ↓
✅ Success → Notes displayed normally
```

---

Use this visual reference to understand and explain the integration to others!
