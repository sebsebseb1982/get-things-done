import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { Todo, CreateTodoDto, UpdateTodoDto } from '../models/todo.model';

const DATA_FILE = path.join(__dirname, '../../data/todos.json');

function readData(): Todo[] {
  if (!fs.existsSync(DATA_FILE)) {
    fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify({ todos: [] }, null, 2));
    return [];
  }
  const raw = fs.readFileSync(DATA_FILE, 'utf-8');
  const parsed = JSON.parse(raw);
  return parsed.todos as Todo[];
}

function writeData(todos: Todo[]): void {
  fs.writeFileSync(DATA_FILE, JSON.stringify({ todos }, null, 2), 'utf-8');
}

export function getAllTodos(filter?: { done?: boolean }): Todo[] {
  const todos = readData();
  if (filter?.done !== undefined) {
    return todos.filter((t) => t.done === filter.done);
  }
  return todos;
}

export function getTodoById(id: string): Todo | undefined {
  return readData().find((t) => t.id === id);
}

export function createTodo(dto: CreateTodoDto): Todo {
  const todos = readData();
  const now = new Date().toISOString();
  const newTodo: Todo = {
    id: uuidv4(),
    title: dto.title,
    description: dto.description ?? '',
    effort: dto.effort,
    priority: dto.priority,
    deadline: dto.deadline ?? null,
    done: false,
    createdAt: now,
    updatedAt: now,
  };
  todos.push(newTodo);
  writeData(todos);
  return newTodo;
}

export function updateTodo(id: string, dto: UpdateTodoDto): Todo | null {
  const todos = readData();
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
  writeData(todos);
  return updated;
}

export function deleteTodo(id: string): boolean {
  const todos = readData();
  const idx = todos.findIndex((t) => t.id === id);
  if (idx === -1) return false;
  todos.splice(idx, 1);
  writeData(todos);
  return true;
}
