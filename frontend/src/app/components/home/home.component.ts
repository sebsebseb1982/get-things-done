import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="flex items-center justify-center min-h-screen bg-gray-950">
      <div class="w-full max-w-md mx-auto p-8">
        <!-- Logo / Title -->
        <div class="text-center mb-10">
          <span class="text-5xl block mb-3">✅</span>
          <h1 class="text-3xl font-bold text-white tracking-tight">Get Things Done</h1>
          <p class="text-gray-500 mt-2 text-sm">Create or open your personal todo list</p>
        </div>

        <!-- Form -->
        <form (ngSubmit)="goToAccount()" class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-400 mb-1.5">Your list name</label>
            <input
              type="text"
              [(ngModel)]="accountName"
              name="accountName"
              placeholder="e.g. toto"
              class="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white placeholder-gray-600
                     focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
              pattern="[a-zA-Z0-9_-]+"
              required
              autofocus
            />
            <p class="text-xs text-gray-600 mt-1">Letters, digits, hyphens and underscores only</p>
          </div>

          @if (errorMsg()) {
            <p class="text-red-400 text-sm">{{ errorMsg() }}</p>
          }

          <button
            type="submit"
            class="w-full bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-semibold py-2.5 px-4 rounded-lg transition-colors"
          >
            Open list
          </button>
        </form>

        <!-- Existing accounts -->
        @if (accounts().length > 0) {
          <div class="mt-10">
            <h2 class="text-sm font-medium text-gray-500 mb-3">Existing lists</h2>
            <div class="flex flex-wrap gap-2">
              @for (account of accounts(); track account) {
                <button
                  class="bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 hover:text-white text-sm px-3 py-1.5 rounded-lg transition-colors"
                  (click)="navigateTo(account)"
                >
                  {{ account }}
                </button>
              }
            </div>
          </div>
        }
      </div>
    </div>
  `,
})
export class HomeComponent implements OnInit {
  private router = inject(Router);
  private http = inject(HttpClient);

  accountName = '';
  accounts = signal<string[]>([]);
  errorMsg = signal<string | null>(null);

  ngOnInit(): void {
    this.http.get<string[]>('/api/accounts').subscribe({
      next: (list) => this.accounts.set(list),
      error: () => {},
    });
  }

  goToAccount(): void {
    const name = this.accountName.trim().toLowerCase();
    if (!name || !/^[a-zA-Z0-9_-]+$/.test(name)) {
      this.errorMsg.set('Invalid name. Use only letters, digits, hyphens and underscores.');
      return;
    }
    this.errorMsg.set(null);
    // Create the account if it doesn't exist, then navigate
    this.http.post('/api/accounts', { name }).subscribe({
      next: () => this.navigateTo(name),
      error: () => this.navigateTo(name), // may already exist, just navigate
    });
  }

  navigateTo(account: string): void {
    this.router.navigate(['/', account]);
  }
}
