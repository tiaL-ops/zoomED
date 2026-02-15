### Step 1: Clone the Repository

```bash
git clone https://github.com/inworld-ai/zoom-demeanor-evaluator-node
cd zoom-demeanor-evaluator-node
```

### Step 2: Install Dependencies

```bash
npm install
```

### Step 3: Configure Environment Variables

Create a `.env` file (copying the `.env.example`) in the project root:
(I piut it in discord :))

ngrok http --url=your-subdomain.ngrok-free.app 3000

(install ngrok if needed)

## Step 4: Run the Application

**For development** (with auto-reload on file changes):

```bash
npm run dev
```

**For production**:

```bash
npm run build
npm start
```