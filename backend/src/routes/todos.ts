import { Router, Request, Response } from 'express';
import * as todoService from '../services/todo.service';
import { CreateTodoDto, UpdateTodoDto } from '../models/todo.model';

type BroadcastFn = (event: string, payload: unknown) => void;
let broadcastFn: BroadcastFn | null = null;
export function setBroadcast(fn: BroadcastFn): void { broadcastFn = fn; }

const router = Router({ mergeParams: true });

function getAccount(req: Request): string {
  return req.params['account'] as string;
}

// GET /api/:account/todos?done=false|true
router.get('/', (req: Request, res: Response) => {
  const account = getAccount(req);
  if (!todoService.accountExists(account)) {
    res.status(404).json({ error: 'Account not found' });
    return;
  }
  const doneParam = req.query['done'];
  let filter: { done?: boolean } | undefined;
  if (doneParam === 'true') filter = { done: true };
  else if (doneParam === 'false') filter = { done: false };
  res.json(todoService.getAllTodos(account, filter));
});

// GET /api/:account/todos/:id
router.get('/:id', (req: Request, res: Response) => {
  const account = getAccount(req);
  const todo = todoService.getTodoById(account, req.params['id'] as string);
  if (!todo) {
    res.status(404).json({ error: 'Todo not found' });
    return;
  }
  res.json(todo);
});

// POST /api/:account/todos
router.post('/', (req: Request, res: Response) => {
  const account = getAccount(req);
  if (!todoService.accountExists(account)) {
    res.status(404).json({ error: 'Account not found' });
    return;
  }
  const { title, description, effort, priority, deadline, category } = req.body as CreateTodoDto;
  if (!title || typeof title !== 'string' || title.trim() === '') {
    res.status(400).json({ error: 'title is required' });
    return;
  }
  if (typeof effort !== 'number' || effort < 1 || effort > 5) {
    res.status(400).json({ error: 'effort must be a number between 1 and 5' });
    return;
  }
  if (typeof priority !== 'number' || priority < 1 || priority > 5) {
    res.status(400).json({ error: 'priority must be a number between 1 and 5' });
    return;
  }
  const todo = todoService.createTodo(account, { title: title.trim(), description, effort, priority, deadline, category });
  broadcastFn?.('todos:changed', { action: 'created', todo });
  res.status(201).json(todo);
});

// PUT /api/:account/todos/:id
router.put('/:id', (req: Request, res: Response) => {
  const account = getAccount(req);
  const dto = req.body as UpdateTodoDto;
  const todo = todoService.updateTodo(account, req.params['id'] as string, dto);
  if (!todo) {
    res.status(404).json({ error: 'Todo not found' });
    return;
  }
  broadcastFn?.('todos:changed', { action: 'updated', todo });
  res.json(todo);
});

// PATCH /api/:account/todos/:id  — partial update (e.g. toggle done)
router.patch('/:id', (req: Request, res: Response) => {
  const account = getAccount(req);
  const dto = req.body as UpdateTodoDto;
  const todo = todoService.updateTodo(account, req.params['id'] as string, dto);
  if (!todo) {
    res.status(404).json({ error: 'Todo not found' });
    return;
  }
  broadcastFn?.('todos:changed', { action: 'updated', todo });
  res.json(todo);
});

// DELETE /api/:account/todos/done — purge all done todos
router.delete('/done', (req: Request, res: Response) => {
  const account = getAccount(req);
  if (!todoService.accountExists(account)) {
    res.status(404).json({ error: 'Account not found' });
    return;
  }
  const count = todoService.purgeDone(account);
  broadcastFn?.('todos:changed', { action: 'purged_done', count });
  res.json({ deleted: count });
});

// DELETE /api/:account/todos — clear all todos
router.delete('/', (req: Request, res: Response) => {
  const account = getAccount(req);
  if (!todoService.accountExists(account)) {
    res.status(404).json({ error: 'Account not found' });
    return;
  }
  const count = todoService.clearAll(account);
  broadcastFn?.('todos:changed', { action: 'cleared', count });
  res.json({ deleted: count });
});

// DELETE /api/:account/todos/:id
router.delete('/:id', (req: Request, res: Response) => {
  const account = getAccount(req);
  const id = req.params['id'] as string;
  const deleted = todoService.deleteTodo(account, id);
  if (!deleted) {
    res.status(404).json({ error: 'Todo not found' });
    return;
  }
  broadcastFn?.('todos:changed', { action: 'deleted', id });
  res.status(204).send();
});

export default router;
