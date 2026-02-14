// server/transcript-simulator.ts
// Utility to simulate real meeting transcripts for testing

export function simulateMeetingTranscript(topic: string): string[] {
  const transcripts: Record<string, string[]> = {
    "machine-learning": [
      "Today we're going to discuss machine learning fundamentals.",
      "Machine learning is a subset of artificial intelligence.",
      "It focuses on creating systems that can learn from data.",
      "There are three main types: supervised learning, unsupervised learning, and reinforcement learning.",
      "In supervised learning, we have labeled training data.",
      "The algorithm learns the relationship between inputs and outputs.",
      "Common supervised learning algorithms include linear regression and decision trees.",
      "Unsupervised learning works with unlabeled data.",
      "Clustering is a popular unsupervised learning technique.",
      "K-means and hierarchical clustering are common methods.",
      "Reinforcement learning involves an agent learning from rewards.",
      "The agent interacts with an environment and learns optimal policies.",
      "Applications include game playing and robotic control.",
    ],
    "data-science": [
      "Welcome to the data science introduction.",
      "Data science combines statistics, programming, and domain knowledge.",
      "The data science pipeline starts with data collection.",
      "Next is data cleaning and preprocessing.",
      "Exploratory data analysis helps us understand the data.",
      "Visualization techniques are crucial for communication.",
      "Feature engineering improves model performance.",
      "We need to handle missing values carefully.",
      "Outlier detection prevents skewed results.",
      "Train-test splits evaluate model generalization.",
      "Cross-validation provides robust performance estimates.",
      "Model evaluation metrics depend on the problem type.",
      "Classification uses accuracy, precision, recall, and F1-score.",
      "Regression uses RMSE, MAE, and R-squared.",
    ],
    "web-development": [
      "Let's discuss modern web development.",
      "HTML provides the structure of web pages.",
      "CSS handles styling and layout.",
      "JavaScript adds interactivity to web pages.",
      "React is a popular JavaScript library for building UIs.",
      "Components are reusable pieces of the UI.",
      "State management helps track application data.",
      "Props allow communication between components.",
      "Hooks like useState and useEffect manage component logic.",
      "Backend development uses Node.js and Express.",
      "Databases store application data.",
      "APIs enable communication between frontend and backend.",
      "REST APIs use HTTP methods: GET, POST, PUT, DELETE.",
      "Authentication secures user accounts.",
      "Authorization determines what users can access.",
    ],
  };

  return transcripts[topic] || transcripts["machine-learning"];
}

export async function sendTranscriptToBackend(
  meetingId: string,
  transcripts: string[],
  backendUrl: string = "http://localhost:3000"
) {
  for (let i = 0; i < transcripts.length; i++) {
    const speaker = ["Instructor", "Student 1", "Student 2"][i % 3];
    const minutes = Math.floor((i / transcripts.length) * 60);
    const seconds = Math.floor(((i / transcripts.length) * 60 - minutes) * 60);
    const timestamp = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;

    try {
      const response = await fetch(`${backendUrl}/api/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          meetingId,
          type: "TRANSCRIPT_UPDATE",
          speaker,
          text: transcripts[i],
          timestamp,
        }),
      });

      if (!response.ok) {
        console.error(`Failed to send transcript ${i + 1}/${transcripts.length}`);
      } else {
        console.log(`✓ Sent transcript ${i + 1}/${transcripts.length}`);
      }

      // Small delay between sends
      await new Promise((resolve) => setTimeout(resolve, 100));
    } catch (error) {
      console.error(`Error sending transcript ${i}:`, error);
    }
  }

  console.log("✓ All transcripts sent!");
}

// For testing: node server/transcript-simulator.ts
if (import.meta.url === `file://${process.argv[1]}`) {
  const topic = process.argv[2] || "machine-learning";
  const meetingId = process.argv[3] || "test-meeting-001";

  const transcripts = simulateMeetingTranscript(topic);
  console.log(`\n📝 Simulating ${topic} meeting...`);
  console.log(`Meeting ID: ${meetingId}`);
  console.log(`Sending ${transcripts.length} transcript segments...\n`);

  sendTranscriptToBackend(meetingId, transcripts);
}
