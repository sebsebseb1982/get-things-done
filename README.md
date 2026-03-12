# Get Things Done

A todo management app with a D3.js bubble chart visualization — quick wins and urgent tasks always float to the top.

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | Angular 21 + TypeScript + TailwindCSS 4 |
| Visualization | D3.js bubble chart |
| Backend API | Express + TypeScript |
| Persistence | JSON flat file |
| Dev experience | ts-node-dev (backend) + ng serve with proxy (frontend) |

## Prerequisites

- Node.js ≥ 18
- npm ≥ 8

## Installation

```bash
npm run install:all
```

This installs dependencies for the root, backend, and frontend in one command.

## Development

```bash
npm run dev
```

Starts both services concurrently with live reload:
- Backend → http://localhost:3000
- Frontend → http://localhost:4200 (proxies `/api` to the backend)

## API reference

Base URL: `http://localhost:3000`

| Method | Path | Description |
|---|---|---|
| GET | `/api/todos` | List all todos (query: `?done=true\|false`) |
| GET | `/api/todos/:id` | Get a todo by ID |
| POST | `/api/todos` | Create a todo |
| PUT | `/api/todos/:id` | Replace a todo |
| PATCH | `/api/todos/:id` | Partial update (e.g. toggle done) |
| DELETE | `/api/todos/:id` | Delete a todo |
| GET | `/health` | Health check |

### Todo object

```json
{
  "id": "uuid",
  "title": "string (required)",
  "description": "string",
  "effort": 1,
  "priority": 5,
  "deadline": "2026-03-15T00:00:00.000Z | null",
  "done": false,
  "createdAt": "ISO 8601",
  "updatedAt": "ISO 8601"
}
```

### Quick test with curl

```bash
# Create a todo
curl -X POST http://localhost:3000/api/todos \
  -H "Content-Type: application/json" \
  -d '{"title":"My task","description":"","effort":2,"priority":4,"deadline":null}'

# Toggle done
curl -X PATCH http://localhost:3000/api/todos/<id> \
  -H "Content-Type: application/json" \
  -d '{"done":true}'
```

## Bubble chart logic

- **Size** of each bubble = `effort` (1–5)
- **Color** = priority: 🔴 P5 → 🟠 P4 → 🟡 P3 → 🟢 P2 → 💚 P1
- **Position** = sorted by score `priority × (6 - effort)` — high priority + low effort (quick wins) float to the centre
- **⚠** badge = deadline within 3 days
- **Click** a bubble → open edit form
- **Double-click** a bubble → toggle done

## Project structure

```
get-things-done/
├── backend/
│   ├── src/
│   │   ├── index.ts              # Express entry point
│   │   ├── models/todo.model.ts  # Todo interface + DTOs
│   │   ├── services/todo.service.ts  # CRUD + JSON persistence
│   │   └── routes/todos.ts       # REST routes
│   └── data/todos.json           # Persistent data (gitignore in prod)
├── frontend/
│   ├── src/app/
│   │   ├── models/todo.model.ts
│   │   ├── services/todo.service.ts
│   │   └── components/
│   │       ├── bubble-chart/     # D3.js bubble chart
│   │       └── todo-form/        # Create / edit modal
│   └── proxy.conf.json           # Dev proxy → backend
└── package.json                  # Root scripts (concurrently)
```
