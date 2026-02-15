// TEST: End-to-End Caption → Quiz Generation Wiring
// Run this to verify everything is correctly connected

const MEETING_ID = 'test-meeting-' + Date.now();
const API_BASE = 'http://localhost:3000';

console.log('='.repeat(70));
console.log('END-TO-END WIRING TEST: Caption → Quiz Generation');
console.log('='.repeat(70));
console.log(`Meeting ID: ${MEETING_ID}`);
console.log();

// ============================================
// TEST 1: Set Topic
// ============================================
async function test1_setTopic() {
  console.log('[Test 1] Setting lesson topic...');
  
  try {
    const response = await fetch(`${API_BASE}/api/topic`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        meetingId: MEETING_ID,
        topic: 'Newton\'s Laws of Motion'
      })
    });
    
    const data = await response.json();
    console.log('✓ Topic set:', data.topic);
    return true;
  } catch (error) {
    console.error('✗ Error:', error.message);
    return false;
  }
}

// ============================================
// TEST 2: Send Test Captions
// ============================================
async function test2_sendCaptions() {
  console.log('\n[Test 2] Sending test captions...');
  
  const captions = [
    'Newton\'s first law states that an object at rest stays at rest unless acted upon by an external force.',
    'The second law relates force, mass, and acceleration: F equals m times a.',
    'The third law states that for every action there is an equal and opposite reaction.',
  ];
  
  try {
    for (let i = 0; i < captions.length; i++) {
      const response = await fetch(`${API_BASE}/api/transcript`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          meetingId: MEETING_ID,
          displayName: 'Dr. Smith',
          text: captions[i],
          topic: 'Newton\'s Laws of Motion',
          timestamp: Date.now() + (i * 1000)
        })
      });
      
      const data = await response.json();
      console.log(`  ✓ Caption ${i + 1}: "${captions[i].substring(0, 50)}..."`);
      console.log(`    Snippet count: ${data.snippetCount}`);
    }
    return true;
  } catch (error) {
    console.error('✗ Error:', error.message);
    return false;
  }
}

// ============================================
// TEST 3: Send Student Events
// ============================================
async function test3_sendStudentEvents() {
  console.log('\n[Test 3] Sending student engagement events...');
  
  const events = [
    { userId: 'student-1', displayName: 'Alice', type: 'ATTENTION_SCORE', cv_attention_score: 0.95 },
    { userId: 'student-2', displayName: 'Bob', type: 'ATTENTION_SCORE', cv_attention_score: 0.2 }, // Low
    { userId: 'student-3', displayName: 'Charlie', type: 'ATTENTION_SCORE', cv_attention_score: 0.15 }, // Low
    { userId: 'student-4', displayName: 'Diana', type: 'ATTENTION_SCORE', cv_attention_score: 0.7 },
    // Add some quiz attempts
    { userId: 'student-1', displayName: 'Alice', type: 'QUIZ_ANSWER', isCorrect: true, responseTimeMs: 3000 },
    { userId: 'student-2', displayName: 'Bob', type: 'QUIZ_ANSWER', isCorrect: false, responseTimeMs: 15000 },
  ];
  
  try {
    for (const event of events) {
      await fetch(`${API_BASE}/api/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          meetingId: MEETING_ID,
          ...event
        })
      });
    }
    console.log(`✓ Sent ${events.length} student events`);
    return true;
  } catch (error) {
    console.error('✗ Error:', error.message);
    return false;
  }
}

// ============================================
// TEST 4: Run Engagement Summarizer
// ============================================
async function test4_engagementSummary() {
  console.log('\n[Test 4] Getting engagement summary...');
  
  try {
    const response = await fetch(`${API_BASE}/api/report?meetingId=${MEETING_ID}`);
    const report = await response.json();
    
    console.log('✓ Report received:');
    console.log(`  - Events: ${report.eventCount}`);
    console.log(`  - Last summary: ${report.lastSummary?.summary}`);
    console.log(`  - Class engagement: ${report.lastSummary?.class_engagement}/3`);
    
    return true;
  } catch (error) {
    console.error('✗ Error:', error.message);
    return false;
  }
}

// ============================================
// TEST 5: Run Multi-Agent Orchestrator
// ============================================
async function test5_orchestrator() {
  console.log('\n[Test 5] Running multi-agent orchestrator...');
  
  try {
    const response = await fetch(`${API_BASE}/api/orchestrate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ meetingId: MEETING_ID })
    });
    
    if (!response.ok) {
      console.error('✗ Error:', response.statusText);
      return false;
    }
    
    const result = await response.json();
    
    console.log('✓ Orchestrator complete:');
    console.log(`  - Class engagement: ${result.summary.classEngagement}/3`);
    console.log(`  - Total participants: ${result.summary.totalParticipants}`);
    console.log(`  - Participants needing help: ${result.summary.participantsNeedingHelp}`);
    console.log(`  - Summary: ${result.summary.classSummary}`);
    
    return result;
  } catch (error) {
    console.error('✗ Error:', error.message);
    return false;
  }
}

// ============================================
// TEST 6: Verify Nudges Generated
// ============================================
async function test6_nudges(orchestratorResult) {
  console.log('\n[Test 6] Checking generated nudges...');
  
  if (!orchestratorResult || !orchestratorResult.nudges) {
    console.warn('⚠ No nudges in result');
    return;
  }
  
  const nudges = orchestratorResult.nudges;
  console.log(`✓ Generated ${nudges.length} nudges:`);
  
  nudges.forEach((nudge, i) => {
    console.log(`\n  Nudge ${i + 1}:`);
    console.log(`    Student: ${nudge.displayName} (${nudge.userId})`);
    console.log(`    Message: "${nudge.message}"`);
    console.log(`    Reason: ${nudge.reason}`);
    console.log(`    Needs Quiz: ${nudge.needsQuiz}`);
  });
  
  return nudges.length > 0;
}

// ============================================
// TEST 7: Verify Quizzes Generated
// ============================================
async function test7_quizzes(orchestratorResult) {
  console.log('\n[Test 7] Checking generated quizzes...');
  
  if (!orchestratorResult || !orchestratorResult.quizzes) {
    console.warn('⚠ No quizzes in result');
    return;
  }
  
  const quizzes = orchestratorResult.quizzes;
  console.log(`✓ Generated ${quizzes.length} personalized quizzes:`);
  
  quizzes.forEach((quiz, i) => {
    console.log(`\n  Quiz ${i + 1}:`);
    console.log(`    For: ${quiz.userId}`);
    console.log(`    Topic: ${quiz.topic}`);
    console.log(`    Difficulty: ${quiz.difficulty}/3`);
    console.log(`    Questions: ${quiz.questions.length}`);
    quiz.questions.forEach((q, qi) => {
      console.log(`      ${qi + 1}. [${q.type}] ${q.question}`);
      if (q.options) {
        q.options.forEach((opt, oi) => {
          const mark = oi === q.correctIndex ? ' ✓' : '';
          console.log(`         ${String.fromCharCode(97 + oi)}) ${opt}${mark}`);
        });
      }
    });
    console.log(`    Encouragement: "${quiz.encouragement}"`);
  });
  
  return quizzes.length > 0;
}

// ============================================
// TEST 8: Verify Content-Based Generation
// ============================================
async function test8_contentBased(orchestratorResult) {
  console.log('\n[Test 8] Verifying content-based quiz generation...');
  
  const quizzes = orchestratorResult?.quizzes || [];
  if (quizzes.length === 0) {
    console.warn('⚠ No quizzes generated');
    return false;
  }
  
  // Check if quiz questions reference Newton's Laws
  const content = quizzes
    .flatMap(q => q.questions.map(qu => qu.question))
    .join(' ')
    .toLowerCase();
  
  const keywords = ['force', 'motion', 'newton', 'object', 'acceleration'];
  const found = keywords.filter(k => content.includes(k));
  
  if (found.length > 0) {
    console.log(`✓ Quiz content based on lesson:`);
    console.log(`  Keywords found: ${found.join(', ')}`);
    return true;
  } else {
    console.warn('⚠ Quiz content may not reference lesson material');
    return false;
  }
}

// ============================================
// RUN ALL TESTS
// ============================================
async function runAllTests() {
  const results = {
    test1: await test1_setTopic(),
    test2: await test2_sendCaptions(),
    test3: await test3_sendStudentEvents(),
    test4: await test4_engagementSummary(),
  };
  
  const orchestratorResult = await test5_orchestrator();
  results.test5 = !!orchestratorResult;
  
  if (orchestratorResult) {
    results.test6 = await test6_nudges(orchestratorResult);
    results.test7 = await test7_quizzes(orchestratorResult);
    results.test8 = await test8_contentBased(orchestratorResult);
  }
  
  // Summary
  console.log('\n' + '='.repeat(70));
  console.log('TEST SUMMARY');
  console.log('='.repeat(70));
  
  const passed = Object.values(results).filter(r => r).length;
  const total = Object.values(results).length;
  
  Object.entries(results).forEach(([test, passed]) => {
    const status = passed ? '✓' : '✗';
    console.log(`${status} ${test}: ${passed ? 'PASS' : 'FAIL'}`);
  });
  
  console.log();
  console.log(`Result: ${passed}/${total} tests passed`);
  
  if (passed === total) {
    console.log('\n🎉 ALL TESTS PASSED! System is correctly wired.');
    console.log('   Captions → Quiz generation pipeline is working!');
  } else {
    console.log('\n❌ Some tests failed. Check the output above.');
  }
  
  console.log('='.repeat(70));
}

// Run tests
runAllTests().catch(console.error);
