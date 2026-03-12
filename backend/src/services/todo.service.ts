import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { Todo, CreateTodoDto, UpdateTodoDto } from '../models/todo.model';

const DATA_DIR = path.join(__dirname, '../../data');

function dataFile(account: string): string {
  return path.join(DATA_DIR, account, 'todos.json');
}

function readData(account: string): Todo[] {
  const file = dataFile(account);
  if (!fs.existsSync(file)) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ todos: [] }, null, 2));
    return [];
  }
  const raw = fs.readFileSync(file, 'utf-8');
  const parsed = JSON.parse(raw);
  return parsed.todos as Todo[];
}

function writeData(account: string, todos: Todo[]): void {
  fs.writeFileSync(dataFile(account), JSON.stringify({ todos }, null, 2), 'utf-8');
}

/** List all existing accounts (subdirectories of data/) */
export function listAccounts(): string[] {
  if (!fs.existsSync(DATA_DIR)) return [];
  return fs.readdirSync(DATA_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && fs.existsSync(path.join(DATA_DIR, d.name, 'todos.json')))
    .map((d) => d.name);
}

/** Create a new account directory with an empty todos.json */
export function createAccount(account: string): void {
  const file = dataFile(account);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, JSON.stringify({ todos: [] }, null, 2));
  }
}

/** Check if an account exists */
export function accountExists(account: string): boolean {
  return fs.existsSync(dataFile(account));
}

export function getAllTodos(account: string, filter?: { done?: boolean }): Todo[] {
  const todos = readData(account);
  if (filter?.done !== undefined) {
    return todos.filter((t) => t.done === filter.done);
  }
  return todos;
}

export function getTodoById(account: string, id: string): Todo | undefined {
  return readData(account).find((t) => t.id === id);
}

export function createTodo(account: string, dto: CreateTodoDto): Todo {
  const todos = readData(account);
  const now = new Date().toISOString();
  const newTodo: Todo = {
    id: uuidv4(),
    title: dto.title,
    description: dto.description ?? '',
    effort: dto.effort,
    priority: dto.priority,
    deadline: dto.deadline ?? null,
    category: dto.category ?? null,
    done: false,
    createdAt: now,
    updatedAt: now,
  };
  todos.push(newTodo);
  writeData(account, todos);
  return newTodo;
}

export function updateTodo(account: string, id: string, dto: UpdateTodoDto): Todo | null {
  const todos = readData(account);
  const idx = todos.findIndex((t) => t.id === id);
  if (idx === -1) return null;
  const updated: Todo = {
    ...todos[idx],
    ...dto,
    id,
    createdAt: todos[idx].createdAt,
    updatedAt: new Date().toISOString(),
  };
  todos[idx] = updated;
  writeData(account, todos);
  return updated;
}

export function deleteTodo(account: string, id: string): boolean {
  const todos = readData(account);
  const idx = todos.findIndex((t) => t.id === id);
  if (idx === -1) return false;
  todos.splice(idx, 1);
  writeData(account, todos);
  return true;
}

export function purgeDone(account: string): number {
  const todos = readData(account);
  const remaining = todos.filter((t) => !t.done);
  const count = todos.length - remaining.length;
  writeData(account, remaining);
  return count;
}

export function clearAll(account: string): number {
  const todos = readData(account);
  const count = todos.length;
  writeData(account, []);
  return count;
}

export function deleteAccount(account: string): boolean {
  const dir = path.join(DATA_DIR, account);
  if (!fs.existsSync(dir)) return false;
  fs.rmSync(dir, { recursive: true, force: true });
  return true;
}
