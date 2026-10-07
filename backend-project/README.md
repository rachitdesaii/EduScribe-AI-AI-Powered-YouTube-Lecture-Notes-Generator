# ⚙️ EduScribe AI — Backend Service

The backend REST API for **EduScribe AI**, built with Express.js, Node.js (ES Modules), and Google Gemini AI (`@google/genai`).

## 🚀 Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment
```bash
# Copy sample configuration
cp .env.example .env
```

Set your Google Gemini API Key inside `.env`:
```env
PORT=5000
NODE_ENV=development
CORS_ORIGIN=http://localhost:4200
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-3.5-flash-lite
```

### 3. Run Development Server
```bash
npm run dev
```

The server starts at `http://localhost:5000`.

---

## 📡 API Endpoints

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/` | API status and root greeting |
| `GET` | `/api/health` | Service uptime and health metrics |
| `POST` | `/api/transcript` | Fetches caption segments and full text for a YouTube URL |
| `POST` | `/api/generate-notes` | Generates summary, key points, concepts, and action items |

---

## 🧪 Running Tests

```bash
npm test
```
Runs unit tests for controllers, pipelines, error handlers, and validators via Node's native test runner.
