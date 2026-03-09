# Get Things Done — Copilot Instructions

A todo manager with a D3.js force-directed bubble visualization. Angular 21 frontend + Express/TypeScript backend. No database — flat JSON file for persistence.

## Build and Test

```bash
# Install all dependencies (root + backend + frontend)
npm run install:all

# Start both services with live reload
npm run dev
# Backend → http://localhost:3000
# Frontend → http://localhost:4200 (proxies /api → backend)

# Frontend tests (Vitest, not Karma/Jasmine)
cd frontend && npm test
```

## Architecture

```
Angular (4200) — /api/* → proxy → Express (3000) → backend/data/todos.json
```

- Backend reads/writes `todos.json` synchronously on every request (no in-memory cache).
- Frontend always uses relative `/api/todos` URLs — the proxy (`proxy.conf.json`) handles the redirect.
- `PUT` and `PATCH` are wired to the same `updateTodo()` handler and behave identically.

## Angular Conventions

- **Standalone components only** — never add `NgModule`. Always use `standalone: true` with explicit `imports: [...]` in `@Component`.
- **`inject()` for all DI** — never constructor injection.
- **Signals for local state** — `signal<T>()`, `.set()`, `.update()`. No RxJS subjects for component state.
- **`provideHttpClient(withFetch())`** is configured globally — use `HttpClient` as normal.
- **New control flow syntax** preferred — use `@if` / `@for` (not `*ngIf` / `*ngFor`) in new or modified templates.
- Templates and styles are **inline** in component files for child components. `AppComponent` uses separate `app.html` / `app.css`.

## D3 Integration

- All D3 event handlers that touch Angular state must call `this.zone.run(() => { ... })` to re-enter change detection.
- The treemap/bubble component guards re-renders with `JSON.stringify` comparison in `ngOnChanges` — avoid expensive re-renders on every keystroke.

## Todo Model

Both frontend (`frontend/src/app/models/todo.model.ts`) and backend (`backend/src/models/todo.model.ts`) share the same shape:

```ts
interface Todo {
  id: string;           // uuid v4
  title: string;
  description: string;
  effort: number;       // 1–5
  priority: number;     // 1–5
  deadline: string | null;  // ISO 8601 or null
  done: boolean;
  createdAt: string;
  updatedAt: string;
}
```

Keep both files in sync when changing the model.

## Common Pitfalls

- **Deadline date handling**: the form uses `.substring(0, 10)` to populate `<input type="date">` and converts back via `new Date(...).toISOString()` on submit — always midnight UTC.
- **D3 events**: any new D3 event handler must wrap Angular mutations in `this.zone.run(...)`.
- **`NgModule` is banned** — standalone only.
