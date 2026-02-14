// Test script to generate notes from actual transcripts
// Run with: npx tsx test-notes.ts

// IMPORTANT: Load .env BEFORE importing agents
import dotenv from "dotenv";
dotenv.config();

import { notesExtractorAgent } from "./agents.js";

// Verify API key is loaded
if (!process.env.CLAUDE_API_KEY) {
  console.error("❌ Error: CLAUDE_API_KEY not found in .env file");
  process.exit(1);
}

// Sample transcript from machine learning meeting
const sampleTranscript = `
[Instructor]: Today we're going to discuss machine learning fundamentals.
[Student 1]: What exactly is machine learning?
[Instructor]: Machine learning is a subset of artificial intelligence that focuses on creating systems that can learn from data rather than being explicitly programmed.
[Student 2]: How is that different from regular programming?
[Instructor]: In regular programming, we write explicit rules. In machine learning, we provide data and let algorithms discover the patterns.
[Student 1]: What are the main types?
[Instructor]: There are three main types: supervised learning, unsupervised learning, and reinforcement learning.
[Student 2]: Can you explain supervised learning?
[Instructor]: In supervised learning, we have labeled training data. The algorithm learns the relationship between inputs and outputs. Common algorithms include linear regression and decision trees.
[Student 1]: What about unsupervised learning?
[Instructor]: Unsupervised learning works with unlabeled data. Clustering is a popular technique - K-means and hierarchical clustering are common methods.
[Student 2]: What's reinforcement learning used for?
[Instructor]: Reinforcement learning involves an agent learning from rewards and penalties by interacting with an environment. It's used in game playing and robotic control.
[Student 1]: This is really interesting!
[Instructor]: Great! These concepts form the foundation for more advanced machine learning topics.
`;

async function testNotesExtraction() {
  console.log("=".repeat(60));
  console.log("Testing Notes Extraction from Transcript");
  console.log("=".repeat(60));
  console.log("\n📝 Input Transcript:\n");
  console.log(sampleTranscript);
  console.log("\n" + "=".repeat(60));
  console.log("🤖 Generating notes with AI...\n");

  try {
    const notes = await notesExtractorAgent(sampleTranscript, "");
    
    console.log("✅ NOTES GENERATED SUCCESSFULLY!\n");
    console.log("=".repeat(60));
    console.log("📌 TITLE:", notes.title);
    console.log("=".repeat(60));
    
    console.log("\n🔑 KEY POINTS:");
    notes.key_points.forEach((point, idx) => {
      console.log(`\n  [${idx + 1}] ${point.title} (${point.importance})`);
      console.log(`      Summary: ${point.summary}`);
      if (point.details.length > 0) {
        console.log(`      Details:`);
        point.details.forEach((detail) => {
          console.log(`        • ${detail}`);
        });
      }
    });

    console.log("\n" + "=".repeat(60));
    console.log("🔗 ASSOCIATIONS (How concepts connect):");
    notes.associations.forEach((assoc, idx) => {
      const fromPoint = notes.key_points.find((p) => p.id === assoc.from_id);
      const toPoint = notes.key_points.find((p) => p.id === assoc.to_id);
      console.log(`\n  [${idx + 1}] ${fromPoint?.title} --[${assoc.relationship_type}]--> ${toPoint?.title}`);
      console.log(`      ${assoc.description}`);
    });

    console.log("\n" + "=".repeat(60));
    console.log("📄 SUMMARY:", notes.summary);
    console.log("=".repeat(60));
    
    console.log("\n🏷️  TAGS:", notes.tags.join(", "));
    console.log("\n" + "=".repeat(60));
    
    // Output full JSON for reference
    console.log("\n📊 FULL JSON OUTPUT:\n");
    console.log(JSON.stringify(notes, null, 2));
    
  } catch (error) {
    console.error("❌ Error generating notes:", error);
    process.exit(1);
  }
}

testNotesExtraction();
