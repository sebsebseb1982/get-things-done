import * as todoService from './todo.service';
import { sendPushoverNotification } from './pushover.service';
import { Todo } from '../models/todo.model';

/**
 * Reminder stages for a todo's deadline, expressed as a fraction of the
 * effort-based lead time counted back from the deadline. Stage 0 fires first
 * (plain notification); the last two require Pushover acknowledgement.
 */
const STAGES: ReadonlyArray<{ fraction: number; priority: 0 | 2 }> = [
  { fraction: 1, priority: 0 },
  { fraction: 0.4, priority: 2 },
  { fraction: 0.1, priority: 2 },
];

// How far in advance of the deadline the first reminder fires, per effort point.
// effort 1 -> 6 days of lead time, effort 5 -> 30 days (one month).
const HOURS_PER_EFFORT_POINT = 6 * 24;

const CHECK_INTERVAL_MS = 15 * 60 * 1000;

// Stop reminding about a deadline that's this far in the past (server downtime, etc).
const MAX_OVERDUE_MS = 24 * 60 * 60 * 1000;

// Reminders are held back until this hour of the day (local to NOTIFICATION_TIMEZONE),
// so nothing buzzes overnight. Anything that came due in the meantime is sent on the
// first check at/after that hour.
const NOTIFICATION_START_HOUR = Number(process.env['NOTIFICATION_START_HOUR'] ?? 9);
const NOTIFICATION_TIMEZONE = process.env['NOTIFICATION_TIMEZONE'] ?? 'Europe/Paris';

function currentHour(now: Date): number {
  const hour = new Intl.DateTimeFormat('en-GB', {
    hour: 'numeric',
    hourCycle: 'h23',
    timeZone: NOTIFICATION_TIMEZONE,
  }).format(now);
  return Number(hour);
}

function isWithinNotificationHours(now: Date): boolean {
  return currentHour(now) >= NOTIFICATION_START_HOUR;
}

function leadTimeMs(effort: number): number {
  return effort * HOURS_PER_EFFORT_POINT * 60 * 60 * 1000;
}

function stageTime(deadline: Date, effort: number, fraction: number): Date {
  return new Date(deadline.getTime() - leadTimeMs(effort) * fraction);
}

function formatDeadline(deadline: Date): string {
  return deadline.toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });
}

async function notifyStage(account: string, todo: Todo, stageIndex: number, deadline: Date): Promise<void> {
  const stage = STAGES[stageIndex]!;
  const isFinal = stageIndex === STAGES.length - 1;
  const title = isFinal ? `⏰ Échéance imminente : ${todo.title}` : `Échéance à venir : ${todo.title}`;
  const message = [
    todo.description || undefined,
    `Échéance : ${formatDeadline(deadline)}`,
    `Effort : ${todo.effort}/5 — Priorité : ${todo.priority}/5`,
  ]
    .filter(Boolean)
    .join('\n');

  const sent = await sendPushoverNotification({ title, message, priority: stage.priority });
  if (sent) {
    todoService.markNotified(account, todo.id, stageIndex);
  }
}

export async function checkDeadlines(): Promise<void> {
  if (!isWithinNotificationHours(new Date())) return;

  const now = Date.now();
  for (const account of todoService.listAccounts()) {
    const todos = todoService.getAllTodos(account, { done: false });
    for (const todo of todos) {
      if (!todo.deadline) continue;
      const deadline = new Date(todo.deadline);
      if (Number.isNaN(deadline.getTime())) continue;
      if (now - deadline.getTime() > MAX_OVERDUE_MS) continue;

      const alreadySent = todo.notifiedStages ?? [];
      for (let stageIndex = 0; stageIndex < STAGES.length; stageIndex++) {
        if (alreadySent.includes(stageIndex)) continue;
        const due = stageTime(deadline, todo.effort, STAGES[stageIndex]!.fraction);
        if (now >= due.getTime()) {
          await notifyStage(account, todo, stageIndex, deadline);
        }
      }
    }
  }
}

let timer: NodeJS.Timeout | null = null;

/** Starts the periodic scan for deadline reminders. Safe to call once at startup. */
export function startDeadlineNotifier(): void {
  if (timer) return;
  checkDeadlines().catch((err) => console.error('[deadline-notifier] check failed:', err));
  timer = setInterval(() => {
    checkDeadlines().catch((err) => console.error('[deadline-notifier] check failed:', err));
  }, CHECK_INTERVAL_MS);
}

export function stopDeadlineNotifier(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
