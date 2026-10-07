# 🖥️ EduScribe AI — Angular Frontend

The modern Single Page Application (SPA) frontend for **EduScribe AI**, built with Angular 21, Angular Material, and Angular Signals.

## 🚀 Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Run Development Server
```bash
npm start
```

Navigate to `http://localhost:4200` in your web browser.

---

## 🎨 Key Features & UI Capabilities

- **Signals Architecture**: Fast, reactive state management using Angular Signals.
- **Angular Material Design**: Polished, accessible cards, buttons, badges, and tabs.
- **Transcript Search & Timestamp Deep-linking**: Jump to exact video timestamps on YouTube or search text in real-time.
- **Dual Reading Modes**: Toggle between timestamped segments and continuous reading.
- **AI Study Note Cards**: Interactive cards for Executive Summaries, Key Takeaways, Concept Glossaries, and Action Items.
- **One-Click Copy**: Instant clipboard copying with UI feedback.

---

## 🔧 Configuration

The backend API base URL is configured in:
- `src/environments/environment.ts` (dev): `http://localhost:5000/api`
- `src/environments/environment.prod.ts` (prod): `/api`

---

## 🧪 Testing & Build

```bash
# Run unit tests via Vitest
npm test

# Build production bundle
npm run build
```
Output artifacts will be generated in `dist/angular-frontend`.
