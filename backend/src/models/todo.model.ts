export interface Todo {
  id: string;
  title: string;
  description: string;
  effort: number;       // 1 to 5
  priority: number;     // 1 to 5
  deadline: string | null; // ISO 8601 or null
  category: string | null;
  done: boolean;
  createdAt: string;   // ISO 8601
  updatedAt: string;   // ISO 8601
}

export type CreateTodoDto = Omit<Todo, 'id' | 'done' | 'createdAt' | 'updatedAt'>;
export type UpdateTodoDto = Partial<Omit<Todo, 'id' | 'createdAt' | 'updatedAt'>>;
