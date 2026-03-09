import {
  Component,
  OnInit,
  signal,
  inject,
  WritableSignal,
  DestroyRef,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { TodoService } from './services/todo.service';
import { Todo, CreateTodoDto, UpdateTodoDto } from './models/todo.model';
import { TreemapComponent } from './components/treemap/treemap.component';
import { TodoFormComponent } from './components/todo-form/todo-form.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, TreemapComponent, TodoFormComponent],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App implements OnInit {
  private todoService = inject(TodoService);
  private destroyRef = inject(DestroyRef);

  todos: WritableSignal<Todo[]> = signal([]);
  showDone: WritableSignal<boolean> = signal(false);
  errorMsg: WritableSignal<string | null> = signal(null);

  formOpen = false;
  editingTodo: Todo | null = null;

  get visibleTodos(): Todo[] {
    return this.showDone()
      ? this.todos()
      : this.todos().filter((t) => !t.done);
  }

  ngOnInit(): void {
    this.loadTodos();
    this.todoService.reload$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.loadTodos());
  }

  loadTodos(): void {
    this.todoService.getAll().subscribe({
      next: (todos) => this.todos.set(todos),
      error: () => this.showError('Failed to load todos. Is the backend running?'),
    });
  }

  openNewForm(): void {
    this.editingTodo = null;
    this.formOpen = true;
  }

  openEditForm(todo: Todo): void {
    this.editingTodo = todo;
    this.formOpen = true;
  }

  closeForm(): void {
    this.formOpen = false;
    this.editingTodo = null;
  }

  onSaved(event: { dto: CreateTodoDto | UpdateTodoDto; id?: string }): void {
    if (event.id) {
      this.todoService.update(event.id, event.dto as UpdateTodoDto).subscribe({
        next: (updated) => {
          this.todos.update((list) => list.map((t) => (t.id === updated.id ? updated : t)));
          this.closeForm();
        },
        error: () => this.showError('Failed to update task.'),
      });
    } else {
      this.todoService.create(event.dto as CreateTodoDto).subscribe({
        next: (created) => {
          this.todos.update((list) => [...list, created]);
          this.closeForm();
        },
        error: () => this.showError('Failed to create task.'),
      });
    }
  }

  onToggleDone(todo: Todo): void {
    this.todoService.toggleDone(todo).subscribe({
      next: (updated) => {
        this.todos.update((list) => list.map((t) => (t.id === updated.id ? updated : t)));
      },
      error: () => this.showError('Failed to toggle task status.'),
    });
  }

  onDeleted(id: string): void {
    this.todoService.delete(id).subscribe({
      next: () => {
        this.todos.update((list) => list.filter((t) => t.id !== id));
        this.closeForm();
      },
      error: () => this.showError('Failed to delete task.'),
    });
  }

  onDuplicated(todo: Todo): void {
    const dto: CreateTodoDto = {
      title: todo.title,
      description: todo.description,
      effort: todo.effort,
      priority: todo.priority,
      deadline: todo.deadline,
    };
    this.todoService.create(dto).subscribe({
      next: (created) => {
        this.todos.update((list) => [...list, created]);
        this.closeForm();
      },
      error: () => this.showError('Failed to duplicate task.'),
    });
  }

  dismissError(): void {
    this.errorMsg.set(null);
  }

  private showError(msg: string): void {
    this.errorMsg.set(msg);
    setTimeout(() => this.errorMsg.set(null), 5000);
  }
}
