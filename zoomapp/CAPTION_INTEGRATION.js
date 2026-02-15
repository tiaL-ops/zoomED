// ZOOM LIVE CAPTIONS INTEGRATION GUIDE
// Add this to your Zoom app to capture real-time captions

// ============================================
// Integration Point 1: Basic Setup
// ============================================
// Add this to your zoomapp/app.js or wherever you initialize the Zoom SDK

async function setupLiveCaptionListener(options = {}) {
  try {
    // Get the current meeting context
    const context = ZoomIntl.getContext();
    const meetingId = context.meetingID || context.meeting_id;
    
    if (!meetingId) {
      console.warn('[Transcript] No meeting ID found');
      return;
    }

    const defaultTopic = options.defaultTopic || 'Lesson Content';

    // Setup live caption event listener
    ZoomIntl.LiveCaptions = {
      onCaptionUpdate: async (payload) => {
        console.log('[Transcript] Caption received:', payload);
        
        // Send caption to backend
        try {
          const response = await fetch('http://localhost:3000/api/transcript', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              meetingId: meetingId,
              userId: payload.userID || payload.user_id || 'instructor',
              displayName: payload.userName || payload.user_name || 'Instructor',
              text: payload.caption || payload.text,
              timestamp: Date.now(),
              topic: defaultTopic
            })
          });

          if (!response.ok) {
            console.error('[Transcript] Failed to send:', await response.text());
          }
        } catch (error) {
          console.error('[Transcript] Error sending caption:', error);
        }
      }
    };

    console.log('[Transcript] Live caption listener initialized for meeting:', meetingId);
  } catch (error) {
    console.error('[Transcript] Setup error:', error);
  }
}

// ============================================
// Integration Point 2: Call during app initialization
// ============================================
// In your app initialization, add:
// setupLiveCaptionListener();

// Example in a Vue/React component:
/*
onMounted(() => {
  setupLiveCaptionListener();
});
*/

// ============================================
// Integration Point 3: Full Example (Vue)
// ============================================
/*
<template>
  <div class="zoom-app">
    <div id="zmmtg-root"></div>
  </div>
</template>

<script>
export default {
  name: 'ZoomApp',
  mounted() {
    this.initializeZoom();
  },
  methods: {
    async initializeZoom() {
      // ... existing Zoom SDK initialization ...
      
      // Add live caption listener
      this.setupLiveCaptionListener();
    },
    
    async setupLiveCaptionListener() {
      const context = ZoomIntl.getContext();
      const meetingId = context.meetingID;
      
      ZoomIntl.LiveCaptions = {
        onCaptionUpdate: async (payload) => {
          await fetch('http://localhost:3000/api/transcript', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              meetingId: meetingId,
              userId: payload.userID || 'instructor',
              displayName: payload.userName || 'Instructor',
              text: payload.caption,
              timestamp: Date.now()
            })
          });
        }
      };
      
      console.log('[Transcript] Caption listener ready');
    }
  }
};
</script>
*/

// ============================================
// Integration Point 4: Robust Version with Retry
// ============================================
async function setupLiveCaptionListenerWithRetry() {
  const MAX_RETRIES = 3;
  const RETRY_DELAY = 1000; // 1 second
  
  async function sendCaption(payload, retries = 0) {
    try {
      const context = ZoomIntl.getContext();
      const meetingId = context.meetingID;
      
      const response = await fetch('http://localhost:3000/api/transcript', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          meetingId: meetingId,
          userId: payload.userID || 'instructor',
          displayName: payload.userName || 'Instructor',
          text: payload.caption,
          timestamp: Date.now()
        })
      });

      if (!response.ok && retries < MAX_RETRIES) {
        console.warn(`[Transcript] Retrying (${retries + 1}/${MAX_RETRIES})`);
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
        return sendCaption(payload, retries + 1);
      }

      if (response.ok) {
        const data = await response.json();
        console.log('[Transcript] Caption sent successfully, total:', data.snippetCount);
      }
    } catch (error) {
      if (retries < MAX_RETRIES) {
        console.warn(`[Transcript] Error, retrying (${retries + 1}/${MAX_RETRIES}):`, error.message);
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
        return sendCaption(payload, retries + 1);
      } else {
        console.error('[Transcript] Failed after retries:', error);
      }
    }
  }

  const context = ZoomIntl.getContext();
  const meetingId = context.meetingID;

  ZoomIntl.LiveCaptions = {
    onCaptionUpdate: (payload) => {
      sendCaption(payload).catch(console.error);
    }
  };

  console.log('[Transcript] Caption listener ready (with retry)');
}

// ============================================
// Testing: Manual Caption Send
// ============================================
async function testSendCaption(meetingId, text) {
  try {
    const response = await fetch('http://localhost:3000/api/transcript', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        meetingId: meetingId,
        userId: 'test-instructor',
        displayName: 'Test Instructor',
        text: text,
        timestamp: Date.now()
      })
    });

    const data = await response.json();
    console.log('[Test] Caption sent:', data);
    return data;
  } catch (error) {
    console.error('[Test] Error:', error);
  }
}

// Usage: testSendCaption('meeting-123', 'Today we are learning about physics')

// ============================================
// Debugging: Log all captions
// ============================================
async function setupLiveCaptionListenerWithLogging() {
  let captionCount = 0;
  const startTime = Date.now();

  const context = ZoomIntl.getContext();
  const meetingId = context.meetingID;

  ZoomIntl.LiveCaptions = {
    onCaptionUpdate: async (payload) => {
      captionCount++;
      const elapsed = Math.round((Date.now() - startTime) / 1000);
      
      console.log(`[Transcript ${captionCount}] (${elapsed}s)`);
      console.log(`  Speaker: ${payload.userName || 'Unknown'}`);
      console.log(`  Text: ${payload.caption}`);
      console.log(`  Raw payload:`, payload);

      // Send to backend
      await fetch('http://localhost:3000/api/transcript', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          meetingId: meetingId,
          userId: payload.userID || 'instructor',
          displayName: payload.userName || 'Instructor',
          text: payload.caption,
          timestamp: Date.now()
        })
      });
    }
  };

  console.log('[Transcript] Detailed logging enabled');
}

// ============================================
// Export for use in your app
// ============================================
export {
  setupLiveCaptionListener,
  setupLiveCaptionListenerWithRetry,
  setupLiveCaptionListenerWithLogging,
  testSendCaption
};
