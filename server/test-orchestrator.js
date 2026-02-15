// Example: Testing the Multi-Agent Orchestration System
// This file demonstrates how to use the orchestrated agent system

import { orchestrateEngagementSystem } from './agents.js';

// Example meeting object (simulated)
const mockMeeting = {
  meetingId: 'test-meeting-123',
  currentTopic: 'Work and Energy in Physics',
  recentTranscriptSnippets: [
    'Today we are discussing kinetic energy and potential energy',
    'Remember, kinetic energy is energy of motion',
    'Potential energy is stored energy'
  ],
  events: [
    // High engagement student
    {
      type: 'QUIZ_ANSWER',
      userId: 'user-1',
      displayName: 'Alice',
      isCorrect: true,
      responseTimeMs: 3000,
      ts: Date.now() - 60000
    },
    {
      type: 'CHAT_MESSAGE',
      userId: 'user-1',
      displayName: 'Alice',
      message: 'Great explanation!',
      ts: Date.now() - 120000
    },
    // Low engagement student - missed polls
    {
      type: 'ATTENTION_SCORE',
      userId: 'user-2',
      displayName: 'Bob',
      cv_attention_score: 0.2, // Low attention
      video_on: true,
      ts: Date.now() - 30000
    },
    {
      type: 'QUIZ_ANSWER',
      userId: 'user-2',
      displayName: 'Bob',
      isCorrect: false,
      responseTimeMs: 15000, // Slow response
      ts: Date.now() - 180000
    },
    // Another low engagement student
    {
      type: 'ATTENTION_SCORE',
      userId: 'user-3',
      displayName: 'Charlie',
      cv_attention_score: 0.15,
      video_on: false,
      ts: Date.now() - 45000
    },
    // Medium engagement
    {
      type: 'QUIZ_ANSWER',
      userId: 'user-4',
      displayName: 'Diana',
      isCorrect: true,
      responseTimeMs: 8000,
      ts: Date.now() - 90000
    },
    {
      type: 'CHAT_MESSAGE',
      userId: 'user-4',
      displayName: 'Diana',
      message: 'I have a question',
      ts: Date.now() - 150000
    }
  ]
};

// Run the orchestrator
async function testOrchestrator() {
  console.log('='.repeat(60));
  console.log('Testing Multi-Agent Orchestration System');
  console.log('='.repeat(60));
  console.log();

  try {
    const result = await orchestrateEngagementSystem(mockMeeting, {
      meetingType: 'education'
    });

    console.log('📊 Class Summary:');
    console.log(`   Total Participants: ${result.summary.totalParticipants}`);
    console.log(`   Class Engagement: ${result.summary.classEngagement}/3`);
    console.log(`   Participants Needing Help: ${result.summary.participantsNeedingHelp}`);
    console.log(`   Summary: ${result.summary.classSummary}`);
    console.log();

    console.log('💬 Nudges Generated:');
    result.nudges.forEach((nudge, i) => {
      console.log(`   ${i + 1}. ${nudge.displayName}:`);
      console.log(`      Message: "${nudge.message}"`);
      console.log(`      Reason: ${nudge.reason}`);
      console.log(`      Needs Quiz: ${nudge.needsQuiz ? 'Yes' : 'No'}`);
      console.log();
    });

    console.log('📝 Quizzes Generated:');
    result.quizzes.forEach((quiz, i) => {
      console.log(`   ${i + 1}. For ${quiz.userId}:`);
      console.log(`      Topic: ${quiz.topic}`);
      console.log(`      Difficulty: ${quiz.difficulty}/3`);
      console.log(`      Questions: ${quiz.questions.length}`);
      quiz.questions.forEach((q, qi) => {
        console.log(`         ${qi + 1}. ${q.question}`);
      });
      console.log(`      Encouragement: "${quiz.encouragement}"`);
      console.log();
    });

    console.log('✅ Full Intervention Details:');
    result.interventions.forEach((intervention, i) => {
      console.log(`   ${i + 1}. ${intervention.displayName} (Engagement: ${intervention.engagement}/3)`);
      console.log(`      Success: ${intervention.success}`);
      console.log(`      Actions Taken: ${intervention.actions.map(a => a.agent).join(' → ')}`);
      if (intervention.error) {
        console.log(`      Error: ${intervention.error}`);
      }
      console.log();
    });

    console.log('='.repeat(60));
    console.log('Test Complete!');
    console.log('='.repeat(60));

    return result;

  } catch (error) {
    console.error('❌ Error running orchestrator:', error);
    throw error;
  }
}

// Export for use in tests or direct execution
export { testOrchestrator, mockMeeting };

// If running directly (not as import)
if (import.meta.url === `file://${process.argv[1]}`) {
  testOrchestrator().catch(console.error);
}
