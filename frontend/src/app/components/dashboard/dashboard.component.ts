import {
  Component,
  OnInit,
  signal,
  inject,
  WritableSignal,
  DestroyRef,
  computed,
  HostListener,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
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
        </div>

        <div class="flex items-center gap-3">
          <!-- Legend -->
          <div class="hidden md:flex items-center gap-2 text-xs text-gray-500 border-r border-gray-700 pr-3">
            <span class="w-3 h-3 rounded-sm bg-red-500 inline-block"></span>P5
            <span class="w-3 h-3 rounded-sm bg-orange-500 inline-block"></span>P4
            <span class="w-3 h-3 rounded-sm bg-yellow-500 inline-block"></span>P3
            <span class="w-3 h-3 rounded-sm bg-lime-500 inline-block"></span>P2
            <span class="w-3 h-3 rounded-sm bg-green-500 inline-block"></span>P1
          </div>

          <!-- Settings menu -->
          <div class="relative">
            <button
              class="flex items-center gap-1.5 text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 border border-gray-700 text-sm px-3 py-2 rounded-lg transition-colors"
              (click)="settingsOpen.update(v => !v)"
              title="Paramètres"
            >
              ⚙ <span class="hidden sm:inline">Paramètres</span>
            </button>
            @if (settingsOpen()) {
              <div class="absolute right-0 top-full mt-1 w-52 bg-gray-800 border border-gray-700 rounded-xl shadow-2xl z-40 overflow-hidden">
                <div class="px-3 py-2 text-xs text-gray-500 font-semibold uppercase tracking-wider border-b border-gray-700">
                  Gestion de la liste
                </div>
                <button
                  class="w-full text-left px-4 py-2.5 text-sm text-orange-400 hover:bg-gray-700 transition-colors flex items-center gap-2"
                  (click)="onPurgeDone()"
                >
                  🗑 Purger les terminées
                </button>
                <button
                  class="w-full text-left px-4 py-2.5 text-sm text-red-400 hover:bg-gray-700 transition-colors flex items-center gap-2"
                  (click)="onClearAll()"
                >
                  ⚠ Supprimer toute la liste
                </button>
              </div>
            }
          </div>

          <!-- New todo button -->
          <button
            class="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
            (click)="openNewForm()"
          >
            <span class="text-base leading-none">+</span> Nouvelle tâche
          </button>
        </div>
      </header>

      <!-- Hint bar -->
      <div class="px-6 py-1.5 bg-gray-900/50 border-b border-gray-800/50 text-xs text-gray-600 shrink-0">
        Clic = éditer &nbsp;·&nbsp; Double-clic = terminer &nbsp;·&nbsp;
        Taille = effort &nbsp;·&nbsp; Couleur = priorité &nbsp;·&nbsp; Centre = urgent · Bord = faible priorité &nbsp;·&nbsp; ⚠ = deadline &lt; 3 jours
      </div>

      <!-- Stats bar -->
      <div class="px-6 py-2 bg-gray-900 border-b border-gray-800 flex items-center gap-5 shrink-0">
        <!-- Show done toggle -->
        <label class="flex items-center gap-2 cursor-pointer select-none">
          <span class="text-sm text-gray-400">Afficher les terminées</span>
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

        <div class="h-4 w-px bg-gray-700"></div>

        <!-- Counts -->
        <div class="flex items-center gap-4 text-sm">
          <span class="text-gray-400">
            <span class="text-white font-semibold">{{ todoCount() }}</span>
            <span class="ml-1">à faire</span>
          </span>
          <span class="text-gray-400">
            <span class="text-green-400 font-semibold">{{ doneCount() }}</span>
            <span class="ml-1">terminée{{ doneCount() > 1 ? 's' : '' }}</span>
          </span>
          @if (todos().length > 0) {
            <span class="text-gray-600 text-xs">({{ todos().length }} total)</span>
          }
        </div>
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
  private router = inject(Router);

  account = signal('');
  todos: WritableSignal<Todo[]> = signal([]);
  showDone: WritableSignal<boolean> = signal(false);
  settingsOpen: WritableSignal<boolean> = signal(false);

  todoCount = computed(() => this.todos().filter((t) => !t.done).length);
  doneCount = computed(() => this.todos().filter((t) => t.done).length);

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    if (!target.closest('.relative')) {
      this.settingsOpen.set(false);
    }
  }
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

  onPurgeDone(): void {
    this.settingsOpen.set(false);
    const count = this.doneCount();
    if (count === 0) return;
    if (!confirm(`Supprimer les ${count} tâche${count > 1 ? 's' : ''} terminée${count > 1 ? 's' : ''} ?`)) return;
    this.todoService.purgeDone().subscribe({
      next: () => this.todos.update((list) => list.filter((t) => !t.done)),
      error: () => this.showError('Impossible de purger les tâches terminées.'),
    });
  }

  onClearAll(): void {
    this.settingsOpen.set(false);
    const name = this.account();
    if (!confirm(`Supprimer la liste "${name}" et toutes ses tâches ? Cette action est irréversible.`)) return;
    this.todoService.deleteAccount().subscribe({
      next: () => this.router.navigate(['/']),
      error: () => this.showError('Impossible de supprimer la liste.'),
    });
  }

  private showError(msg: string): void {
    this.errorMsg.set(msg);
    setTimeout(() => this.errorMsg.set(null), 5000);
  }
}
