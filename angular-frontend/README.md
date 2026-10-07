# Angular Frontend — AI Notes Generator

Standalone Angular application (Angular 21) with routing and Angular Material.

## Features

- Routing enabled (`app.routes.ts`), Home route lazy-loaded
- Angular Material (Azure/Blue theme, Material 3)
- Fully responsive layout (mobile / tablet / desktop breakpoints)
- `HomeComponent`: title, input field, "Generate Notes" button, loading spinner, output cards
- `ApiService`: typed HTTP client wrapper for the backend API
- No authentication/login

## Setup

```bash
npm install
npm start
```

App runs at `http://localhost:4200`.

## Build

```bash
npm run build
```

Output goes to `dist/angular-frontend`.

## Test

```bash
npm test
```

## Backend connection

The API base URL is configured in:
- `src/environments/environment.ts` (dev): `http://localhost:5000/api`
- `src/environments/environment.prod.ts` (prod): `/api`

`ApiService.generateNotes()` calls `POST {apiUrl}/notes/generate` with `{ prompt: string }`
and expects `{ success: boolean, notes: [{ id, title, content }] }` in response.
Update this contract in `src/app/core/services/api.ts` and
`src/app/core/models/note.model.ts` to match your actual backend endpoint.
