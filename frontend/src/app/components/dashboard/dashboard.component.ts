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
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TodoService } from '../../services/todo.service';
import { Todo, CreateTodoDto, UpdateTodoDto } from '../../models/todo.model';
import { version } from '../../../../package.json';
import { BubbleChartComponent } from '../bubble-chart/bubble-chart.component';
import { TodoFormComponent } from '../todo-form/todo-form.component';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink, BubbleChartComponent, TodoFormComponent],
  template: `
    <div class="flex flex-col h-screen bg-gray-950 overflow-hidden">

      <!-- Header -->
      <header class="flex items-center justify-between px-6 py-3 bg-gray-900 border-b border-gray-800 shrink-0">
        <div class="flex items-center gap-3">
          <a class="text-2xl cursor-pointer hover:scale-110 transition-transform" routerLink="/" title="Home">✅</a>
          <h1 class="text-xl font-bold text-white tracking-tight">Get Things Done - {{ account() }}</h1>
          <span class="text-xs text-gray-600 font-mono">v{{ appVersion }}</span>
          <span class="text-xs text-gray-500 ml-2">{{ todos().length }} tasks</span>
        </div>

        <div class="flex items-center gap-3">
          <!-- Toggle done tasks -->
          <label class="flex items-center gap-2 cursor-pointer select-none">
            <span class="text-sm text-gray-400">Show done</span>
            <div class="relative">
              <input
                type="checkbox"
                class="sr-only peer"
                [checked]="showDone()"
                (change)="showDone.set(!showDone())"
              />
              <div class="w-9 h-5 bg-gray-700 rounded-full peer peer-checked:bg-green-600 transition-colors
                          after:content-[''] after:absolute after:top-0.5 after:left-0.5
                          after:bg-white after:rounded-full after:h-4 after:w-4
                          after:transition-all peer-checked:after:translate-x-4"></div>
            </div>
          </label>

          <!-- Legend -->
          <div class="hidden md:flex items-center gap-2 text-xs text-gray-500 border-l border-gray-700 pl-3">
            <span class="w-3 h-3 rounded-sm bg-red-500 inline-block"></span>P5
            <span class="w-3 h-3 rounded-sm bg-orange-500 inline-block"></span>P4
            <span class="w-3 h-3 rounded-sm bg-yellow-500 inline-block"></span>P3
            <span class="w-3 h-3 rounded-sm bg-lime-500 inline-block"></span>P2
            <span class="w-3 h-3 rounded-sm bg-green-500 inline-block"></span>P1
          </div>

          <!-- New todo button -->
          <button
            class="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
            (click)="openNewForm()"
          >
            <span class="text-base leading-none">+</span> New task
          </button>
        </div>
      </header>

      <!-- Hint bar -->
      <div class="px-6 py-1.5 bg-gray-900/50 border-b border-gray-800/50 text-xs text-gray-600 shrink-0">
        Click a bubble to edit &nbsp;·&nbsp; Double-click to toggle done &nbsp;·&nbsp;
        Size = effort &nbsp;·&nbsp; Color = priority &nbsp;·&nbsp; Centre = urgent · Bord = faible priorité &nbsp;·&nbsp; ⚠ = deadline in &lt;3 days
      </div>

      <!-- Bubble chart area -->
      <main class="flex-1 overflow-hidden p-3">
        <app-bubble-chart
          [todos]="visibleTodos"
          (editTodo)="openEditForm($event)"
          (toggleDone)="onToggleDone($event)"
          class="block w-full h-full"
        ></app-bubble-chart>
      </main>

      <!-- Error toast -->
      @if (errorMsg()) {
        <div
          class="fixed bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-3 bg-red-900 border border-red-700 text-white text-sm px-5 py-3 rounded-xl shadow-xl z-50"
        >
          <span>⚠ {{ errorMsg() }}</span>
          <button class="text-red-300 hover:text-white ml-2 text-base" (click)="dismissError()">✕</button>
        </div>
      }

    </div>

    <!-- Todo form modal -->
    @if (formOpen) {
      <app-todo-form
        [todo]="editingTodo"
        (close)="closeForm()"
        (saved)="onSaved($event)"
        (deleted)="onDeleted($event)"
        (duplicated)="onDuplicated($event)"
      ></app-todo-form>
    }
  `,
})
export class DashboardComponent implements OnInit {
  readonly appVersion = version;

  private todoService = inject(TodoService);
  private destroyRef = inject(DestroyRef);
  private route = inject(ActivatedRoute);

  account = signal('');
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
    this.route.params
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((params) => {
        const acct = params['account'] as string;
        this.account.set(acct);
        this.todoService.setAccount(acct);
        this.loadTodos();
      });

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
