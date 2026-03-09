import { Router, Request, Response } from 'express';
import * as todoService from '../services/todo.service';
import { CreateTodoDto, UpdateTodoDto } from '../models/todo.model';

const router = Router();

// GET /api/todos?done=false|true
router.get('/', (req: Request, res: Response) => {
  const doneParam = req.query['done'];
  let filter: { done?: boolean } | undefined;
  if (doneParam === 'true') filter = { done: true };
  else if (doneParam === 'false') filter = { done: false };
  res.json(todoService.getAllTodos(filter));
});

// GET /api/todos/:id
router.get('/:id', (req: Request, res: Response) => {
  const todo = todoService.getTodoById(req.params['id'] as string);
  if (!todo) {
    res.status(404).json({ error: 'Todo not found' });
    return;
  }
  res.json(todo);
});

// POST /api/todos
router.post('/', (req: Request, res: Response) => {
  const { title, description, effort, priority, deadline } = req.body as CreateTodoDto;
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
  const todo = todoService.createTodo({ title: title.trim(), description, effort, priority, deadline });
  res.status(201).json(todo);
});

// PUT /api/todos/:id
router.put('/:id', (req: Request, res: Response) => {
  const dto = req.body as UpdateTodoDto;
  const todo = todoService.updateTodo(req.params['id'] as string, dto);
  if (!todo) {
    res.status(404).json({ error: 'Todo not found' });
    return;
  }
  res.json(todo);
});

// PATCH /api/todos/:id  — partial update (e.g. toggle done)
router.patch('/:id', (req: Request, res: Response) => {
  const dto = req.body as UpdateTodoDto;
  const todo = todoService.updateTodo(req.params['id'] as string, dto);
  if (!todo) {
    res.status(404).json({ error: 'Todo not found' });
    return;
  }
  res.json(todo);
});

// DELETE /api/todos/:id
router.delete('/:id', (req: Request, res: Response) => {
  const deleted = todoService.deleteTodo(req.params['id'] as string);
  if (!deleted) {
    res.status(404).json({ error: 'Todo not found' });
    return;
  }
  res.status(204).send();
});

export default router;
