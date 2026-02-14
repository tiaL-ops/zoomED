import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import { quizPollAgent } from './agents.js';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Remove restrictive CSP or set a permissive one for development
app.use((req, res, next) => {
    res.setHeader(
        'Content-Security-Policy',
        "default-src * 'unsafe-inline' 'unsafe-eval' data: blob:; connect-src *;"
    );
    next();
});

// Serve static files from videoapp directory
app.use(express.static(path.join(__dirname, '../videoapp')));

// API endpoint: receives avgGaze and returns status
app.post('/api/analyze-gaze', (req, res) => {
    const { avgGaze } = req.body;

    if (typeof avgGaze !== 'number') {
        return res.status(400).json({ error: 'avgGaze must be a number' });
    }

    let status, background, direction;

    if (avgGaze < 0.38) {
        status = "BORED";
        background = "yellow";
        direction = "Looking Left 👈";
    } else if (avgGaze > 0.62) {
        status = "BORED";
        background = "yellow";
        direction = "Looking Right 👉";
    } else {
        status = "FOCUS";
        background = "#00ff00";
        direction = "Center ";
    }

    res.json({ status, background, direction });
});

// API endpoint: generate poll from summary.txt
app.get('/api/poll', async (req, res) => {
    try {
        // Read summary.txt
        const summaryPath = path.join(__dirname, 'summary.txt');
        const summaryContent = await fs.readFile(summaryPath, 'utf-8');
        
        // Extract topic from the summary
        const topicMatch = summaryContent.match(/\*\*Topic:\*\* (.*)/);
        const topic = topicMatch ? topicMatch[1] : "Work and Energy - AP Physics";
        
        // Parse student engagement from the Student Engagement Breakdown section
        const students = [];
        
        // Extract Maya (High Engagement)
        const mayaMatch = summaryContent.match(/Student A \(Maya\):.*?High Engagement\.(.*?)(?=\*|$)/s);
        if (mayaMatch) {
            // Find Maya's interactions in transcript
            const mayaSnippetMatch = summaryContent.match(/\*\*Maya.*?\*\*.*?"(.*?)"/s);
            students.push({
                name: "Maya",
                engagementLevel: 3,
                transcriptSnippet: mayaSnippetMatch ? mayaSnippetMatch[1] : "Understanding the relationship between work and kinetic energy",
                description: "High Engagement - actively participated"
            });
        }
        
        // Extract Carlos (Medium Engagement)
        const carlosMatch = summaryContent.match(/Student B \(Carlos\):.*?Medium Engagement\.(.*?)(?=\*|$)/s);
        if (carlosMatch) {
            const carlosSnippetMatch = summaryContent.match(/\*\*Carlos.*?\*\*.*?"(.*?)"/s);
            students.push({
                name: "Carlos",
                engagementLevel: 2,
                transcriptSnippet: carlosSnippetMatch ? carlosSnippetMatch[1] : "The component of force that does work on the crate",
                description: "Medium Engagement - following along with prompts"
            });
        }
        
        // Extract Liam (Low Engagement)
        const liamMatch = summaryContent.match(/Student C \(Liam\):.*?Low Engagement\.(.*?)(?=\*|$)/s);
        if (liamMatch) {
            students.push({
                name: "Liam",
                engagementLevel: 1,
                transcriptSnippet: "A 5kg mass is at rest. I apply a force that does 100J of work. What is the final velocity?",
                description: "Low Engagement - needs basic review"
            });
        }
        
        // Generate polls for each student based on their engagement level
        const studentPolls = [];
        
        for (const student of students) {
            const poll = await quizPollAgent(
                topic,
                student.transcriptSnippet,
                student.engagementLevel
            );
            
            studentPolls.push({
                student: student.name,
                engagementLevel: student.engagementLevel,
                description: student.description,
                poll: poll
            });
        }
        
        res.json({
            success: true,
            topic: topic,
            studentPolls: studentPolls,
            source: 'summary.txt'
        });
    } catch (error) {
        console.error('Error generating poll:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to generate poll',
            message: error.message 
        });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
}).on('error', (err) => {
    console.error("Server failed to start:", err);
});