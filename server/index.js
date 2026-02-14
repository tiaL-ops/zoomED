import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

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

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
}).on('error', (err) => {
    console.error("Server failed to start:", err);
});