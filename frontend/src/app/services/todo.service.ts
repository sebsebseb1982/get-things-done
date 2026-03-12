import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, Subject, tap } from 'rxjs';
import { Todo, CreateTodoDto, UpdateTodoDto } from '../models/todo.model';

@Injectable({ providedIn: 'root' })
export class TodoService {
  private readonly http = inject(HttpClient);
  private account = '';

  private get baseUrl(): string {
    return `/api/${this.account}/todos`;
  }

  private readonly _reload$ = new Subject<void>();
  readonly reload$ = this._reload$.asObservable();

  /** Counts locally-initiated mutations awaiting their WS echo. */
  private pendingMutations = 0;

  constructor() {
    this.connectWebSocket();
  }

  /** Set the current account (called when route changes) */
  setAccount(account: string): void {
    this.account = account;
  }

  private connectWebSocket(): void {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${proto}//${location.host}/ws`);
    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string);
        if (msg.event === 'todos:changed') {
          if (this.pendingMutations > 0) {
            // This echo is from our own mutation — skip the reload.
            this.pendingMutations--;
          } else {
            this._reload$.next();
          }
        }
      } catch { /* ignore malformed messages */ }
    };
    ws.onclose = () => setTimeout(() => this.connectWebSocket(), 3000);
  }

  /** Wraps a mutating HTTP call: increments the pending counter, decrements on error (no WS echo on failure). */
  private trackMutation<T>(obs: Observable<T>): Observable<T> {
    this.pendingMutations++;
    return obs.pipe(tap({ error: () => { this.pendingMutations--; } }));
  }
  getAll(filter?: { done?: boolean }): Observable<Todo[]> {
    let params = new HttpParams();
    if (filter?.done !== undefined) {
      params = params.set('done', String(filter.done));
    }
    return this.http.get<Todo[]>(this.baseUrl, { params });
  }

  getById(id: string): Observable<Todo> {
    return this.http.get<Todo>(`${this.baseUrl}/${id}`);
  }

  create(dto: CreateTodoDto): Observable<Todo> {
    return this.trackMutation(this.http.post<Todo>(this.baseUrl, dto));
  }

  update(id: string, dto: UpdateTodoDto): Observable<Todo> {
    return this.trackMutation(this.http.put<Todo>(`${this.baseUrl}/${id}`, dto));
  }

  patch(id: string, dto: UpdateTodoDto): Observable<Todo> {
    return this.trackMutation(this.http.patch<Todo>(`${this.baseUrl}/${id}`, dto));
  }

  toggleDone(todo: Todo): Observable<Todo> {
    return this.patch(todo.id, { done: !todo.done });
  }

  delete(id: string): Observable<void> {
    return this.trackMutation(this.http.delete<void>(`${this.baseUrl}/${id}`));
  }
}
