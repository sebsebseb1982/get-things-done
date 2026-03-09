import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Todo, CreateTodoDto, UpdateTodoDto } from '../models/todo.model';

@Injectable({ providedIn: 'root' })
export class TodoService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = '/api/todos';

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
    return this.http.post<Todo>(this.baseUrl, dto);
  }

  update(id: string, dto: UpdateTodoDto): Observable<Todo> {
    return this.http.put<Todo>(`${this.baseUrl}/${id}`, dto);
  }

  patch(id: string, dto: UpdateTodoDto): Observable<Todo> {
    return this.http.patch<Todo>(`${this.baseUrl}/${id}`, dto);
  }

  toggleDone(todo: Todo): Observable<Todo> {
    return this.patch(todo.id, { done: !todo.done });
  }

  delete(id: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}`);
  }
}
