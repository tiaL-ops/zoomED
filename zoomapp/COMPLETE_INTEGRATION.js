// COMPLETE INTEGRATION GUIDE: Caption → Quiz Generation
// This shows the entire flow from Zoom captions to personalized quizzes

// ============================================
// STEP 1: Zoom App Setup (zoomapp/app.js)
// ============================================
import { setupLiveCaptionListener } from './CAPTION_INTEGRATION.js';

export async function initializeApp() {
  console.log('[App] Initializing...');
  
  // Get meeting ID from Zoom context
  const context = ZoomIntl.getContext();
  const meetingId = context.meetingID;
  
  if (!meetingId) {
    console.error('[App] No meeting ID found');
    return;
  }
  
  console.log('[App] Meeting ID:', meetingId);
  
  // CRITICAL: Setup caption listener FIRST
  // This will start streaming captions to /api/transcript
  setupLiveCaptionListener();
  
  // OPTIONAL: Auto-trigger agent orchestration every N seconds
  startAgentOrchestration(meetingId);
}

// ============================================
// STEP 2: Auto-trigger Quiz Generation
// ============================================
let orchestrationInterval = null;

function startAgentOrchestration(meetingId, intervalSeconds = 15) {
  console.log(`[App] Starting agent orchestration every ${intervalSeconds}s`);
  
  orchestrationInterval = setInterval(async () => {
    try {
      console.log('[App] Triggering agent orchestration...');
      
      const response = await fetch('http://localhost:3000/api/orchestrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ meetingId })
      });
      
      if (!response.ok) {
        console.error('[App] Orchestration failed:', response.statusText);
        return;
      }
      
      const result = await response.json();
      
      console.log('[App] Orchestration complete');
      console.log('  - Class engagement:', result.summary.classEngagement);
      console.log('  - Participants needing help:', result.summary.participantsNeedingHelp);
      console.log('  - Nudges generated:', result.nudges.length);
      console.log('  - Quizzes generated:', result.quizzes.length);
      
      // Display nudges to students
      result.nudges.forEach(nudge => {
        console.log(`[Nudge] ${nudge.displayName}: ${nudge.message}`);
        // You can send this to a UI component
        window.dispatchEvent(new CustomEvent('nudge-received', { detail: nudge }));
      });
      
      // Display quizzes
      result.quizzes.forEach(quiz => {
        console.log(`[Quiz] Generated ${quiz.questions.length} questions for engagement level ${quiz.difficulty}`);
        console.log(`  Topic: ${quiz.topic}`);
        console.log(`  Encouragement: ${quiz.encouragement}`);
        window.dispatchEvent(new CustomEvent('quiz-received', { detail: quiz }));
      });
      
    } catch (error) {
      console.error('[App] Orchestration error:', error);
    }
  }, intervalSeconds * 1000);
}

function stopAgentOrchestration() {
  if (orchestrationInterval) {
    clearInterval(orchestrationInterval);
    orchestrationInterval = null;
    console.log('[App] Agent orchestration stopped');
  }
}

// ============================================
// STEP 3: Listen for Quiz Events
// ============================================
window.addEventListener('quiz-received', (event) => {
  const quiz = event.detail;
  console.log('[UI] Received quiz:', quiz);
  
  // Send to your UI component
  // Example: displayQuizToStudent(quiz);
});

window.addEventListener('nudge-received', (event) => {
  const nudge = event.detail;
  console.log('[UI] Received nudge:', nudge);
  
  // Example: showNudgePopup(nudge);
});

// ============================================
// STEP 4: Manual Trigger (For Testing)
// ============================================
async function manuallyTriggerOrchestration(meetingId) {
  console.log('[Manual] Triggering orchestration...');
  
  try {
    const response = await fetch('http://localhost:3000/api/orchestrate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ meetingId })
    });
    
    const result = await response.json();
    console.log('[Manual] Result:', result);
    
    return result;
  } catch (error) {
    console.error('[Manual] Error:', error);
    throw error;
  }
}

// ============================================
// STEP 5: Data Flow Verification
// ============================================
async function verifyDataFlow(meetingId) {
  console.log('[Verify] Checking data flow...');
  
  try {
    // 1. Get meeting state
    const reportResponse = await fetch(`http://localhost:3000/api/report?meetingId=${meetingId}`);
    const report = await reportResponse.json();
    
    console.log('[Verify] Meeting Report:');
    console.log('  - Total events:', report.eventCount);
    console.log('  - Last engagement summary:', report.lastSummary?.summary);
    console.log('  - Class engagement:', report.lastSummary?.class_engagement);
    
    // 2. Check transcript snippets
    if (report.lastSummary?.participantContexts) {
      console.log('  - Participants with context:', report.lastSummary.participantContexts.length);
    }
    
    return report;
  } catch (error) {
    console.error('[Verify] Error:', error);
    throw error;
  }
}

// ============================================
// COMPLETE FLOW EXAMPLE
// ============================================
export async function startCompleteFlow(meetingId) {
  console.log('='.repeat(60));
  console.log('STARTING COMPLETE CAPTION → QUIZ FLOW');
  console.log('='.repeat(60));
  
  // 1. Setup captions
  console.log('\n[Flow] Step 1: Setting up Zoom caption listener...');
  setupLiveCaptionListener();
  console.log('[Flow] ✓ Caption listener ready');
  
  // 2. Start auto-orchestration
  console.log('[Flow] Step 2: Starting agent orchestration loop...');
  startAgentOrchestration(meetingId, 10); // Every 10 seconds
  console.log('[Flow] ✓ Orchestration loop running');
  
  // 3. Verify flow
  console.log('[Flow] Step 3: Verifying data flow...');
  await new Promise(resolve => setTimeout(resolve, 3000)); // Wait 3s for initial events
  const report = await verifyDataFlow(meetingId);
  console.log('[Flow] ✓ Data verified');
  
  console.log('\n' + '='.repeat(60));
  console.log('FLOW STATUS:');
  console.log('  📝 Captions: Listening for Zoom live captions');
  console.log('  📊 Events: Being recorded in meeting.events[]');
  console.log('  🎤 Transcripts: Stored in meeting.recentTranscriptSnippets[]');
  console.log('  🤖 Agents: Running every 10 seconds');
  console.log('  📋 Quizzes: Generated based on current lesson content');
  console.log('='.repeat(60));
  
  return {
    meetingId,
    started: true,
    stopFn: stopAgentOrchestration
  };
}

// ============================================
// EXPORT
// ============================================
export {
  initializeApp,
  startAgentOrchestration,
  stopAgentOrchestration,
  manuallyTriggerOrchestration,
  verifyDataFlow
};

// ============================================
// QUICK DEBUG HELPERS
// ============================================

// Check what captions have been received
async function debugGetCaptions(meetingId) {
  const response = await fetch(`http://localhost:3000/api/report?meetingId=${meetingId}`);
  const data = await response.json();
  console.log('Recent transcript snippets:', data);
}

// Manually send a test caption to verify integration
async function debugSendTestCaption(meetingId) {
  const testText = 'Today we are learning about Newton\'s Laws of Motion. The first law states that an object at rest stays at rest unless acted upon by an external force.';
  
  try {
    const response = await fetch('http://localhost:3000/api/transcript', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        meetingId,
        displayName: 'Test Instructor',
        text: testText,
        timestamp: Date.now()
      })
    });
    
    const result = await response.json();
    console.log('[Test] Caption sent:', result);
    
    // Now trigger orchestration
    console.log('[Test] Triggering orchestration...');
    const orchestrationResult = await manuallyTriggerOrchestration(meetingId);
    
    console.log('[Test] Generated quizzes:');
    orchestrationResult.quizzes?.forEach(quiz => {
      console.log(`  Topic: ${quiz.topic}`);
      console.log(`  Questions: ${quiz.questions.length}`);
      quiz.questions.forEach((q, i) => {
        console.log(`    ${i + 1}. ${q.question}`);
      });
    });
    
    return orchestrationResult;
  } catch (error) {
    console.error('[Test] Error:', error);
  }
}

// Export debug helpers
export { debugGetCaptions, debugSendTestCaption };

// ============================================
// CONSOLE USAGE
// ============================================
// 
// In your Zoom app console:
// 
// // Start everything
// import { startCompleteFlow } from './COMPLETE_INTEGRATION.js';
// await startCompleteFlow('meeting-123');
//
// // Test manually
// import { debugSendTestCaption } from './COMPLETE_INTEGRATION.js';
// await debugSendTestCaption('meeting-123');
//
// // Stop orchestration
// import { stopAgentOrchestration } from './COMPLETE_INTEGRATION.js';
// stopAgentOrchestration();
//
