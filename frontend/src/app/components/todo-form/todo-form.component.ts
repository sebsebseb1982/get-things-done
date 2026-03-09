import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnInit,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  ReactiveFormsModule,
  FormBuilder,
  FormGroup,
  Validators,
} from '@angular/forms';
import { Todo, CreateTodoDto, UpdateTodoDto } from '../../models/todo.model';

@Component({
  selector: 'app-todo-form',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  template: `
    <!-- Backdrop -->
    <div
      class="fixed inset-0 bg-black/60 z-40 flex items-center justify-center p-4"
      (click)="onBackdropClick($event)"
    >
      <!-- Panel -->
      <div
        class="relative bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl w-full max-w-lg z-50"
        (click)="$event.stopPropagation()"
      >
        <!-- Header -->
        <div class="flex items-center justify-between p-6 border-b border-gray-700">
          <h2 class="text-xl font-bold text-white">
            {{ todo ? 'Edit task' : 'New task' }}
          </h2>
          <button
            type="button"
            class="text-gray-400 hover:text-white transition-colors p-1 rounded"
            (click)="close.emit()"
          >
            ✕
          </button>
        </div>

        <!-- Form -->
        <form [formGroup]="form" (ngSubmit)="onSubmit()" class="p-6 space-y-4">

          <!-- Title -->
          <div>
            <label class="block text-sm font-medium text-gray-300 mb-1">Title <span class="text-red-400">*</span></label>
            <input
              formControlName="title"
              type="text"
              placeholder="What needs to be done?"
              class="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors"
              [class.border-red-500]="form.get('title')?.invalid && form.get('title')?.touched"
            />
            <p *ngIf="form.get('title')?.invalid && form.get('title')?.touched" class="text-red-400 text-xs mt-1">Title is required.</p>
          </div>

          <!-- Description -->
          <div>
            <label class="block text-sm font-medium text-gray-300 mb-1">Description</label>
            <textarea
              formControlName="description"
              rows="3"
              placeholder="Additional details..."
              class="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors resize-none"
            ></textarea>
          </div>

          <!-- Effort + Priority -->
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-300 mb-2">
                Effort: <span class="text-white font-bold">{{ form.get('effort')?.value }}</span>/5
              </label>
              <input
                formControlName="effort"
                type="range" min="1" max="5" step="1"
                class="w-full accent-blue-500"
              />
              <div class="flex justify-between text-xs text-gray-500 mt-1">
                <span>Quick</span><span>Heavy</span>
              </div>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-300 mb-2">
                Priority: <span [class]="priorityTextClass(form.get('priority')?.value)">{{ form.get('priority')?.value }}</span>/5
              </label>
              <input
                formControlName="priority"
                type="range" min="1" max="5" step="1"
                class="w-full accent-red-500"
              />
              <div class="flex justify-between text-xs text-gray-500 mt-1">
                <span>Low</span><span>Critical</span>
              </div>
            </div>
          </div>

          <!-- Deadline -->
          <div>
            <label class="block text-sm font-medium text-gray-300 mb-1">Deadline <span class="text-gray-500 text-xs">(optional)</span></label>
            <input
              formControlName="deadline"
              type="date"
              class="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500 transition-colors"
            />
          </div>

          <!-- Done toggle (edit mode only) -->
          <div *ngIf="todo" class="flex items-center gap-3 pt-1">
            <label class="relative inline-flex items-center cursor-pointer">
              <input
                formControlName="done"
                type="checkbox"
                class="sr-only peer"
              />
              <div class="w-10 h-5 bg-gray-700 rounded-full peer peer-checked:bg-green-500 transition-colors after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-5"></div>
            </label>
            <span class="text-sm text-gray-300">Mark as done</span>
          </div>

          <!-- Actions -->
          <div class="flex justify-end gap-3 pt-2">
            <button
              type="button"
              class="px-4 py-2 text-sm text-gray-300 hover:text-white bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors"
              (click)="close.emit()"
            >Cancel</button>
            <button
              *ngIf="todo"
              type="button"
              class="px-4 py-2 text-sm text-red-400 hover:text-white hover:bg-red-900 rounded-lg transition-colors"
              (click)="onDelete()"
            >Delete</button>
            <button
              type="submit"
              [disabled]="form.invalid || loading"
              class="px-5 py-2 text-sm font-semibold bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
            >{{ loading ? 'Saving…' : (todo ? 'Save changes' : 'Create task') }}</button>
          </div>
        </form>
      </div>
    </div>
  `,
})
export class TodoFormComponent implements OnInit {
  @Input() todo: Todo | null = null;
  @Output() close = new EventEmitter<void>();
  @Output() saved = new EventEmitter<{ dto: CreateTodoDto | UpdateTodoDto; id?: string }>();
  @Output() deleted = new EventEmitter<string>();

  private fb = inject(FormBuilder);
  form!: FormGroup;
  loading = false;

  ngOnInit(): void {
    this.form = this.fb.group({
      title: [this.todo?.title ?? '', [Validators.required, Validators.minLength(1)]],
      description: [this.todo?.description ?? ''],
      effort: [this.todo?.effort ?? 3],
      priority: [this.todo?.priority ?? 3],
      deadline: [this.todo?.deadline ? this.todo.deadline.substring(0, 10) : ''],
      done: [this.todo?.done ?? false],
    });
  }

  priorityTextClass(value: number): string {
    const map: Record<number, string> = {
      5: 'text-red-400 font-bold',
      4: 'text-orange-400 font-bold',
      3: 'text-yellow-400 font-bold',
      2: 'text-lime-400 font-bold',
      1: 'text-green-400 font-bold',
    };
    return map[value] ?? 'text-white font-bold';
  }

  onSubmit(): void {
    if (this.form.invalid) return;
    const raw = this.form.value;
    const dto: CreateTodoDto | UpdateTodoDto = {
      title: raw['title'].trim(),
      description: raw['description'] ?? '',
      effort: Number(raw['effort']),
      priority: Number(raw['priority']),
      deadline: raw['deadline'] ? new Date(raw['deadline']).toISOString() : null,
      ...(this.todo ? { done: raw['done'] } : {}),
    };
    this.saved.emit({ dto, id: this.todo?.id });
  }

  onDelete(): void {
    if (this.todo) this.deleted.emit(this.todo.id);
  }

  onBackdropClick(event: MouseEvent): void {
    if ((event.target as HTMLElement) === event.currentTarget) {
      this.close.emit();
    }
  }
}
