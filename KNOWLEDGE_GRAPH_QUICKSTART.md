# Knowledge Graph System - Quick Start

## Overview

Your multi-agent system now extracts knowledge graphs from lesson transcripts and tracks per-participant mastery of concepts. Quizzes are automatically linked to specific concepts, enabling personalized learning paths.

## What Was Built

### Core Features
1. **Class-Level Knowledge Graph** - Semantic map of concepts from transcripts
2. **Per-Participant Progress Tracking** - Each student's mastery per concept
3. **Knowledge-Aware Quizzes** - Questions linked to specific graph concepts
4. **Mastery Tracking API** - Update student progress as they answer

### Files Modified
- `server/index.js` - Added 4 endpoints, enhanced orchestration
- `server/agents.js` - Enhanced 3 agents, added knowledge graph extraction

## API Reference

### 1. Get Class Knowledge Graph
```
GET /api/knowledge-graph/:meetingId
```

Returns the shared knowledge graph for the lesson.

**Example:**
```bash
curl http://localhost:3000/api/knowledge-graph/meeting-123
```

**Response:**
```json
{
  "meetingId": "meeting-123",
  "knowledgeGraph": {
    "title": "Physics Lesson",
    "key_points": [
      {
        "id": "kp1",
        "title": "Newton's Second Law",
        "summary": "F = ma",
        "importance": "high"
      }
    ],
    "associations": [
      {
        "from_id": "kp1",
        "to_id": "kp2",
        "relationship_type": "prerequisite"
      }
    ]
  }
}
```

### 2. Get Student Progress
```
GET /api/knowledge-graph/:meetingId/:userId
```

Returns a student's progress through the knowledge graph.

**Example:**
```bash
curl http://localhost:3000/api/knowledge-graph/meeting-123/student-456
```

**Response:**
```json
{
  "userId": "student-456",
  "displayName": "Alice",
  "masteredConcepts": ["kp1", "kp2"],
  "strugglingConcepts": ["kp3"],
  "encounteredConcepts": ["kp1", "kp2", "kp3"],
  "quizHistory": [
    {
      "timestamp": 1708001200000,
      "topic": "Newton's Laws",
      "questions": [
        { "id": "q1", "linkedConcepts": ["kp1"] }
      ]
    }
  ],
  "conceptDetails": [
    {
      "id": "kp1",
      "title": "Newton's Second Law",
      "mastered": true,
      "struggling": false
    }
  ]
}
```

### 3. Update Concept Mastery
```
POST /api/knowledge-graph/:meetingId/:userId/update-mastery
```

Track when a student masters or struggles with a concept.

**Request:**
```bash
curl -X POST http://localhost:3000/api/knowledge-graph/meeting-123/student-456/update-mastery \
  -H "Content-Type: application/json" \
  -d '{"conceptId": "kp1", "mastered": true}'
```

**Response:**
```json
{
  "success": true,
  "userId": "student-456",
  "conceptId": "kp1",
  "mastered": true,
  "progress": {
    "masteredCount": 3,
    "strugglingCount": 1,
    "encounteredCount": 8
  }
}
```

### 4. Get Class Overview
```
GET /api/knowledge-graph/:meetingId/participants/all
```

Returns class-wide progress summary.

**Example:**
```bash
curl http://localhost:3000/api/knowledge-graph/meeting-123/participants/all
```

**Response:**
```json
{
  "meetingId": "meeting-123",
  "totalParticipants": 25,
  "participants": [
    {
      "userId": "student-456",
      "displayName": "Alice",
      "masteredConceptsCount": 3,
      "strugglingConceptsCount": 1,
      "totalConceptsEncountered": 8,
      "quizzesAttempted": 2
    }
  ]
}
```

## Integration Guide

### Step 1: Send Transcripts
As Zoom captions arrive, send them to your backend:

```javascript
// In your Zoom integration
function onCaptionReceived(caption) {
  fetch('/api/transcript', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      meetingId: currentMeetingId,
      text: caption.text,
      topic: currentTopic,
      displayName: 'Instructor'
    })
  });
}
```

### Step 2: Trigger Orchestration
Every 10 seconds, trigger the multi-agent system:

```javascript
// Auto-trigger orchestration
setInterval(async () => {
  const response = await fetch('/api/orchestrate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ meetingId: currentMeetingId })
  });
  
  const result = await response.json();
  
  // Handle results
  if (result.knowledgeGraph) {
    displayKnowledgeGraph(result.knowledgeGraph);
  }
  
  result.quizzes.forEach(quiz => {
    sendQuizToStudent(quiz.userId, quiz);
  });
}, 10000);
```

### Step 3: Display Knowledge Graph
Show the concept map to students:

```javascript
function displayKnowledgeGraph(graph) {
  const concepts = graph.key_points;
  const relationships = graph.associations;
  
  // Render as nodes and edges
  concepts.forEach(concept => {
    addNode({
      id: concept.id,
      label: concept.title,
      importance: concept.importance
    });
  });
  
  relationships.forEach(rel => {
    addEdge({
      from: rel.from_id,
      to: rel.to_id,
      label: rel.relationship_type
    });
  });
}
```

### Step 4: Track Quiz Responses
When students answer quizzes, update their mastery:

```javascript
async function submitQuiz(userId, quiz, answers) {
  // Grade the quiz
  let correctCount = 0;
  answers.forEach((answer, i) => {
    if (answer === quiz.questions[i].correctIndex) {
      correctCount++;
    }
  });
  
  const passThreshold = 0.7;
  const mastered = correctCount / answers.length >= passThreshold;
  
  // Update mastery for each concept
  const allConcepts = quiz.questions
    .flatMap(q => q.linkedConcepts || []);
  
  const uniqueConcepts = [...new Set(allConcepts)];
  
  for (const conceptId of uniqueConcepts) {
    await fetch(`/api/knowledge-graph/${meetingId}/${userId}/update-mastery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conceptId, mastered })
    });
  }
}
```

### Step 5: Display Student Progress
Show personalized progress to each student:

```javascript
async function showStudentProgress(userId) {
  const response = await fetch(
    `/api/knowledge-graph/${meetingId}/${userId}`
  );
  const progress = await response.json();
  
  // Show mastered concepts
  progress.conceptDetails.forEach(concept => {
    const status = concept.mastered ? 'Mastered' : 
                   concept.struggling ? 'Review Needed' : 
                   'Learning';
    
    displayConcept(concept.title, status);
  });
  
  // Show stats
  displayStats({
    mastered: progress.masteredConcepts.length,
    struggling: progress.strugglingConcepts.length,
    total: progress.encounteredConcepts.length
  });
}
```

## Testing

### Manual Test Flow

1. **Send Transcript:**
```bash
curl -X POST http://localhost:3000/api/transcript \
  -H "Content-Type: application/json" \
  -d '{
    "meetingId": "test-meeting",
    "text": "Newton'\''s Second Law states that force equals mass times acceleration",
    "topic": "Physics"
  }'
```

2. **Add Low-Engagement Student:**
```bash
curl -X POST http://localhost:3000/api/events \
  -H "Content-Type: application/json" \
  -d '{
    "meetingId": "test-meeting",
    "type": "GAZE",
    "userId": "student-1",
    "displayName": "Alice",
    "avgGaze": 0.25
  }'
```

3. **Trigger Orchestration:**
```bash
curl -X POST http://localhost:3000/api/orchestrate \
  -H "Content-Type: application/json" \
  -d '{"meetingId": "test-meeting"}'
```

4. **Check Knowledge Graph:**
```bash
curl http://localhost:3000/api/knowledge-graph/test-meeting
```

5. **Check Student Progress:**
```bash
curl http://localhost:3000/api/knowledge-graph/test-meeting/student-1
```

6. **Update Mastery:**
```bash
curl -X POST http://localhost:3000/api/knowledge-graph/test-meeting/student-1/update-mastery \
  -H "Content-Type: application/json" \
  -d '{"conceptId": "kp1", "mastered": true}'
```

### Expected Results

After orchestration:
- Knowledge graph created with 3-5 concepts
- Quiz generated for low-engagement student
- Questions have `linkedConcepts` field
- Student progress tracked in system

## Data Flow

```
1. Transcripts arrive
   POST /api/transcript
   
2. Stored in meeting.recentTranscriptSnippets

3. Orchestration triggered
   POST /api/orchestrate
   
4. Knowledge graph extracted
   notesExtractorAgent analyzes transcripts
   
5. Per-participant quizzes generated
   quizPollAgent uses knowledge graph
   Questions linked to concepts
   
6. Student answers quiz
   Frontend grades responses
   
7. Update mastery
   POST /update-mastery
   
8. Progress stored
   meeting.participantKnowledgeProgress[userId]
```

## Frontend Integration Examples

### React Component: Knowledge Graph Viewer
```jsx
function KnowledgeGraphViewer({ meetingId }) {
  const [graph, setGraph] = useState(null);
  
  useEffect(() => {
    fetch(`/api/knowledge-graph/${meetingId}`)
      .then(res => res.json())
      .then(data => setGraph(data.knowledgeGraph));
  }, [meetingId]);
  
  if (!graph) return <div>Loading...</div>;
  
  return (
    <div>
      <h2>{graph.title}</h2>
      <div className="concepts">
        {graph.key_points.map(kp => (
          <ConceptNode key={kp.id} concept={kp} />
        ))}
      </div>
    </div>
  );
}
```

### React Component: Student Progress
```jsx
function StudentProgress({ meetingId, userId }) {
  const [progress, setProgress] = useState(null);
  
  useEffect(() => {
    fetch(`/api/knowledge-graph/${meetingId}/${userId}`)
      .then(res => res.json())
      .then(setProgress);
  }, [meetingId, userId]);
  
  if (!progress) return <div>Loading...</div>;
  
  return (
    <div>
      <h3>{progress.displayName}'s Progress</h3>
      <div>
        <span>Mastered: {progress.masteredConcepts.length}</span>
        <span>Struggling: {progress.strugglingConcepts.length}</span>
      </div>
      <div className="concepts">
        {progress.conceptDetails.map(concept => (
          <div key={concept.id}>
            <span>{concept.title}</span>
            <span>{concept.mastered ? 'Mastered' : 'Learning'}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
```

### React Component: Teacher Dashboard
```jsx
function TeacherDashboard({ meetingId }) {
  const [classData, setClassData] = useState(null);
  
  useEffect(() => {
    fetch(`/api/knowledge-graph/${meetingId}/participants/all`)
      .then(res => res.json())
      .then(setClassData);
  }, [meetingId]);
  
  if (!classData) return <div>Loading...</div>;
  
  const struggling = classData.participants
    .filter(p => p.strugglingConceptsCount > 2);
  
  return (
    <div>
      <h2>Class Overview</h2>
      <p>Total Students: {classData.totalParticipants}</p>
      
      <h3>Students Needing Help ({struggling.length})</h3>
      {struggling.map(student => (
        <div key={student.userId}>
          {student.displayName}: {student.strugglingConceptsCount} struggling concepts
        </div>
      ))}
    </div>
  );
}
```

## Common Use Cases

### 1. Adaptive Quiz Difficulty
```javascript
async function generateAdaptiveQuiz(userId, meetingId) {
  // Get student's struggling concepts
  const progress = await fetch(
    `/api/knowledge-graph/${meetingId}/${userId}`
  ).then(r => r.json());
  
  const strugglingConcepts = progress.strugglingConcepts;
  
  // Generate easier questions for struggling concepts
  // This happens automatically in the quiz agent
  // based on the knowledge graph context
}
```

### 2. Prerequisite Enforcement
```javascript
function canStudentAccessConcept(userId, conceptId, graph) {
  // Find prerequisites
  const prerequisites = graph.associations
    .filter(a => a.to_id === conceptId && a.relationship_type === 'prerequisite')
    .map(a => a.from_id);
  
  // Check if student mastered all prerequisites
  const progress = getStudentProgress(userId);
  return prerequisites.every(preq => 
    progress.masteredConcepts.includes(preq)
  );
}
```

### 3. Spaced Repetition
```javascript
function scheduleReview(userId, conceptId) {
  const lastReviewed = getLastReviewTime(userId, conceptId);
  const daysSince = (Date.now() - lastReviewed) / (1000 * 60 * 60 * 24);
  
  // Review after 1, 3, 7, 14 days
  const intervals = [1, 3, 7, 14];
  const nextInterval = intervals.find(i => daysSince >= i);
  
  if (nextInterval) {
    scheduleQuizForConcept(userId, conceptId);
  }
}
```

## Troubleshooting

### Knowledge Graph Not Generated
**Issue:** `knowledgeGraph: null` in response

**Fixes:**
1. Check server logs for error messages
2. Ensure transcripts have enough content (50+ words)
3. Verify Claude API key is configured
4. Check `callClaudeJSON` function accepts `maxTokens` parameter

### Quizzes Missing linkedConcepts
**Issue:** Questions don't have `linkedConcepts` field

**Fix:** Knowledge graph extraction is failing. See above.

### Progress Not Updating
**Issue:** Mastery updates don't persist

**Fix:** Ensure you're calling the update-mastery endpoint after grading each quiz.

### Empty Participant Progress
**Issue:** GET progress returns 404

**Fix:** Student hasn't received any quizzes yet. Progress is only created when orchestration generates a quiz for them.

## Production Checklist

Before deploying:
- [ ] Add database persistence (MongoDB/PostgreSQL)
- [ ] Implement rate limiting on endpoints
- [ ] Add authentication/authorization
- [ ] Set up logging and monitoring
- [ ] Add input validation
- [ ] Handle edge cases (empty transcripts, no participants)
- [ ] Load test with realistic participant counts

## Current Limitations

**In-Memory Storage:**
- Data lost on server restart
- No historical tracking
- Limited to available RAM

**Easy Fixes:**
- Add database layer for persistence
- Implement caching for frequently accessed graphs
- Add cleanup for old meetings

## Next Steps

### Week 1: Frontend Display
- Create knowledge graph visualization component
- Show student progress indicators
- Display mastered vs struggling concepts

### Week 2: Database Persistence
- Set up MongoDB or PostgreSQL
- Migrate in-memory storage to database
- Query historical graphs

### Week 3: Adaptive Learning
- Implement spaced repetition
- Auto-adjust quiz difficulty
- Generate targeted review questions

### Week 4: Teacher Analytics
- Class-wide heatmaps
- Trend analysis over time
- Export reports (PDF, CSV)
