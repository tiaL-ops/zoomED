# Zoom Live Caption Integration

## Quick Start

### 1. **Add to Your Zoom App** (zoomapp/app.js)

```javascript
import { setupLiveCaptionListener } from './CAPTION_INTEGRATION.js';

// In your app initialization:
setupLiveCaptionListener();
```

### 2. **Test It**

Once running, send a test caption:

```bash
curl -X POST http://localhost:3000/api/transcript \
  -H "Content-Type: application/json" \
  -d '{
    "meetingId": "meeting-123",
    "userId": "user-1",
    "displayName": "John Doe",
    "text": "Today we are learning about physics"
  }'
```

### 3. **Verify in Your Agents**

The transcript data is automatically available to your agents via:
- `meeting.recentTranscriptSnippets` array
- `classContext.recentTranscript` in orchestrator

## How It Works

```
Zoom Meeting (Live Captions)
           ↓
ZoomIntl.LiveCaptions.onCaptionUpdate()
           ↓
POST /api/transcript
           ↓
meeting.recentTranscriptSnippets[]
           ↓
Agents use it for context
```

## API Endpoint

### POST /api/transcript

**Request Body:**
```json
{
  "meetingId": "string (required)",
  "userId": "string (optional, defaults to 'instructor')",
  "displayName": "string (optional, defaults to 'Instructor')",
  "text": "string (required) - the caption text",
  "timestamp": "number (optional, defaults to Date.now())"
}
```

**Response:**
```json
{
  "ok": true,
  "snippetCount": 42
}
```

## Integration Guides

### Option A: Simple (Recommended for Testing)
```javascript
// In zoomapp/app.js
import { setupLiveCaptionListener } from './CAPTION_INTEGRATION.js';

// Call during app init
setupLiveCaptionListener();
```

### Option B: Robust (With Retry Logic)
```javascript
import { setupLiveCaptionListenerWithRetry } from './CAPTION_INTEGRATION.js';

setupLiveCaptionListenerWithRetry();
```

### Option C: Debugging (With Detailed Logging)
```javascript
import { setupLiveCaptionListenerWithLogging } from './CAPTION_INTEGRATION.js';

setupLiveCaptionListenerWithLogging();
```

## Verify Captions Are Flowing

1. Open browser DevTools (F12)
2. Watch for `[Transcript]` logs
3. Check Server Logs: `[Transcript] Caption received: ...`
4. Verify in API response: snippetCount increases

## Accessing Captions in Your Code

### In Agents
```javascript
// Via engagementSummarizerAgent
const summary = await engagementSummarizerAgent(meeting);
// meeting.recentTranscriptSnippets is available

// Via orchestrator
const result = await orchestrateEngagementSystem(meeting);
// classContext.recentTranscript contains joined captions
```

### In Frontend
```javascript
// WebSocket message
{
  type: 'TRANSCRIPT',
  payload: {
    userId: 'user-1',
    displayName: 'John Doe',
    text: 'the caption text',
    timestamp: 1234567890
  }
}
```

## File Structure

```
zoomapp/
├── CAPTION_INTEGRATION.js      ← Integration code
├── app.js                       ← Import and call setupLiveCaptionListener()
└── ...

server/
└── index.js                     ← POST /api/transcript endpoint
```

## Troubleshooting

**Q: Captions not arriving?**
- Check Zoom SDK is properly initialized
- Verify `ZoomIntl` is available
- Check browser console for errors

**Q: Backend not receiving captions?**
- Check server is running on port 3000
- Verify network tab shows POST /api/transcript
- Check CORS settings

**Q: Transcripts not used by agents?**
- Verify `recentTranscriptSnippets` has data
- Check `orchestrateEngagementSystem` is being called
- Debug: `console.log(meeting.recentTranscriptSnippets)`

## Example Flow

1. Instructor speaks: "The velocity of the object is 5 m/s"
2. Zoom captions it
3. `onCaptionUpdate` fires
4. POST to `/api/transcript`
5. Stored in `meeting.recentTranscriptSnippets`
6. When agents run, they see the transcript
7. `quizPollAgent` uses it to generate relevant questions
8. Student gets personalized quiz based on what was just taught

## Next Steps

1. Copy `CAPTION_INTEGRATION.js` to your zoomapp folder
2. Import and call `setupLiveCaptionListener()` in your Zoom app
3. Test with the curl command above
4. Run agents with `/api/orchestrate` endpoint
5. Verify agents use the captions for better context
