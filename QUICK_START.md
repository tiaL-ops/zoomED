# ⚡ Quick Start - 5 Minutes to Zoom Notes

## Prerequisites
- Node.js installed
- `CLAUDE_API_KEY` environment variable set
- Port 3000, 4000, 8080 available

## 1️⃣ One-Time Setup (2 minutes)

### Windows
```bash
setup.bat
```

### Mac/Linux
```bash
chmod +x setup.sh
./setup.sh
```

## 2️⃣ Start Services (open 3-4 terminals)

### Terminal 1: Backend (Express)
```bash
cd server
set CLAUDE_API_KEY=your_api_key_here
node index.js
```
✅ Running on `http://localhost:3000`

### Terminal 2: Auth Server
```bash
cd zoomapp/meetingsdk-auth-endpoint-sample
npm start
```
✅ Running on `http://localhost:4000`

### Terminal 3: Zoom App
```bash
cd zoomapp
npx serve -p 8080
```
✅ Running on `http://localhost:8080`

### Terminal 4: (Optional) Simulate Transcripts
```bash
cd server
npx tsx transcript-simulator.ts machine-learning test-meeting-001
```
Sends sample transcript data to backend

## 3️⃣ Test It (1 minute)

1. Open `http://localhost:8080`
2. Enter Meeting ID: `test-meeting-001` (or `89247964461`)
3. Click "Join Meeting"
4. Wait 5 seconds for Zoom to load
5. See notes panel on the right side
6. Click "Generate Notes" button
7. Watch it generate! (3-8 seconds)
8. Click on any concept to see details

## 🎯 Key Features to Try

### Explore Knowledge Graph
1. Click "Generate Notes"
2. Concepts appear as colored boxes
3. Click any concept to expand
4. See related concepts below

### View Connections
1. Click a concept
2. Scroll down to "Connections"
3. See how concepts relate:
   - `prerequisite` - Must learn first
   - `related` - Connected to
   - `example_of` - Is an example of
   - `expands_on` - Provides more detail

### Ask AI to Modify
1. Click a concept to expand
2. Scroll to chat area (bottom of panel)
3. Type: "Add concept about neural networks"
4. Click "Refine"
5. AI updates notes in seconds!

## 📊 What You're Seeing

### Summary (Top)
- Overview of the meeting
- Key tags for quick scanning

### Key Concepts (Middle)
- Important ideas extracted by AI
- Color-coded by importance
- HIGH (red) → MEDIUM (orange) → LOW (green)
- Click to explore details

### Details View (Right side when clicked)
- Full explanation
- Supporting points
- How it connects to other concepts

## 🧪 Test Scenarios

### Test Machine Learning Notes
```bash
cd server
npx tsx transcript-simulator.ts machine-learning demo-001
```
Then generate notes for meeting `demo-001`

### Test Data Science Notes
```bash
cd server
npx tsx transcript-simulator.ts data-science demo-002
```

### Test Web Development Notes
```bash
cd server
npx tsx transcript-simulator.ts web-development demo-003
```

## ❌ Troubleshooting

### "Failed to get meeting signature"
- ❌ Auth server not running (Terminal 2)
- ✅ Run: `cd zoomapp/meetingsdk-auth-endpoint-sample && npm start`

### "Failed to generate notes"
- ❌ Backend not running (Terminal 1)
- ❌ CLAUDE_API_KEY not set
- ✅ Check: `echo $CLAUDE_API_KEY` (should show your key)

### Notes panel not visible
- ❌ Meeting not fully loaded
- ✅ Wait 10 seconds after joining
- ✅ Refresh page and try again

### Can't join meeting
- ❌ Meeting ID wrong
- ✅ Use `89247964461` or `test-meeting-001`
- ✅ Check passcode (usually `cD86BY`)

## 📖 Documentation

| File | Purpose |
|------|---------|
| `ZOOM_NOTES_README.md` | Complete feature guide |
| `INTEGRATION_SUMMARY.md` | High-level overview |
| `VISUAL_REFERENCE.md` | Diagrams & flows |
| `IMPLEMENTATION_CHECKLIST.md` | Technical details |

## 🎮 Interactive Demo Walkthrough

### 5-Minute Demo
1. **(0:00)** Join meeting `test-meeting-001`
2. **(0:30)** Show notes panel on right
3. **(1:00)** Click "Generate Notes"
4. **(2:00)** Show generated concepts
5. **(3:00)** Click on a concept, show details
6. **(4:00)** Ask AI to add new concept
7. **(4:45)** Show updated notes
8. **(5:00)** Show how it works on mobile

### 10-Minute Deep Dive
- Show architecture
- Explain AI agents
- Demo different topics
- Explain relationships
- Show refinement process
- Discuss use cases

## 💡 Pro Tips

### Get Better Notes
- Type full sentences to transcript simulator
- Include diverse topics
- Mix technical and conceptual content

### Refine Faster
- Ask specific questions to AI
- "Connect X to Y"
- "Add section on Z"
- "Explain relationship between A and B"

### Test Extensively
- Try all 3 topics (ML, DS, WebDev)
- Test on desktop and mobile
- Try different concepts
- Test relationship types

## 🚀 What's Happening Behind the Scenes

```
Your Click
    ↓
Frontend JavaScript
    ↓
HTTP Request to Backend (Port 3000)
    ↓
Backend Express Server
    ↓
Claude AI (via API)
    ↓
Returns Knowledge Graph JSON
    ↓
Frontend Renders Notes
    ↓
You See Pretty Knowledge Graph!
```

## ⏱️ Typical Timeline

| Action | Time |
|--------|------|
| Click "Generate Notes" | 0s |
| Request sent to backend | 0.1s |
| Backend calls Claude | 0.2s |
| Claude analyzes (inference) | 4-6s |
| Claude returns response | 6-8s |
| Frontend renders | 6.1-8.1s |
| **User sees notes** | **~8s total** |

## 📱 Responsive Design

### Desktop (1200px+)
- Notes panel on right
- Side-by-side layout
- Full features

### Tablet (768-1200px)
- Notes panel below video
- Scrollable content

### Mobile (<768px)
- Full-width notes
- Expandable sections
- Touch-friendly buttons

## 🎯 Success Criteria

✅ **All Working If:**
- [ ] Can join Zoom meeting
- [ ] Notes panel visible on right
- [ ] "Generate Notes" button clickable
- [ ] Notes generate in 8 seconds
- [ ] Can see key concepts
- [ ] Can click concepts to expand
- [ ] Can see connections
- [ ] Can ask AI to modify notes
- [ ] Works on mobile (responsive)

## 🔗 Quick Links

**Local Services:**
- Frontend: http://localhost:8080
- Backend: http://localhost:3000/api/notes/test-001
- Auth: http://localhost:4000

**Main Files:**
- Backend: `server/index.ts`
- Zoom App: `zoomapp/app.js`
- Notes Panel: `zoomapp/index.html`

## 💬 Example Queries for AI Refinement

```javascript
// Add new concept
"Add a section about convolutional neural networks"

// Connect ideas
"Show how supervised learning relates to neural networks"

// Clarify
"Explain the difference between training and inference"

// Expand
"Add more details about the backpropagation algorithm"

// Modify
"Change the importance of 'statistical analysis' to high"
```

## 📊 Sample Notes Output

After clicking "Generate Notes", you'll see:

```json
{
  "title": "Machine Learning Fundamentals",
  "summary": "Introduction to ML concepts including supervised/unsupervised learning...",
  "key_points": [
    {
      "title": "Machine Learning",
      "summary": "Subset of AI focused on learning from data",
      "importance": "high"
    },
    {
      "title": "Supervised Learning",
      "summary": "Learning with labeled training data",
      "importance": "high"
    }
  ],
  "associations": [
    {
      "relationship_type": "prerequisite",
      "description": "Must understand ML basics before supervised learning"
    }
  ]
}
```

## ✨ Features Included

✅ Real-time transcript capture
✅ AI-powered note generation
✅ Knowledge graph visualization
✅ Interactive concept exploration
✅ AI-powered refinement
✅ Mobile responsive
✅ Multiple test topics
✅ Complete documentation

---

**That's it!** You now have AI-powered meeting notes in Zoom.

**Questions?** Check the full docs or look at the code examples.

**Ready to ship!** 🚀
