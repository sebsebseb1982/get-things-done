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

## Deadline notifications (Pushover)

Todos with a `deadline` get up to 3 Pushover reminders as the deadline approaches:

1. **First reminder** — plain notification, no acknowledgement required.
2. **Second reminder** — emergency priority, requires acknowledgement (Pushover retries until acked or it expires).
3. **Final reminder** — same as above, closest to the deadline.

The reminders are spaced out based on the todo's `effort` (1–5): higher effort means the lead time before the deadline is longer (6 days per effort point), so a 5-effort task starts getting reminded 30 days out while a 1-effort task starts 6 days out. The three stages fire at 100%, 40% and 10% of that lead time before the deadline. A background check runs every 15 minutes; state is tracked per todo so each stage is only sent once (it resets if the deadline or effort changes, or a done todo is reopened).

Requires these environment variables (passed to the Docker container, e.g. `docker run -e PUSHOVER_TOKEN=... -e PUSHOVER_USER=...`):

| Variable | Description |
|---|---|
| `PUSHOVER_TOKEN` | Pushover application API token |
| `PUSHOVER_USER` | Pushover user/group key |

If either is missing, reminders are skipped with a warning logged — the rest of the app is unaffected.

Reminders are never sent during the night: nothing is pushed before **9:00** (Europe/Paris). A reminder that comes due overnight is sent at the first check after 9:00. Optional variables:

| Variable | Default | Description |
|---|---|---|
| `NOTIFICATION_START_HOUR` | `9` | Hour of the day (0–23) from which reminders may be sent |
| `NOTIFICATION_TIMEZONE` | `Europe/Paris` | IANA timezone used to evaluate that hour |

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
