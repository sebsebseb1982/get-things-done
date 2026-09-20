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
  notifiedStages: number[]; // indices of deadline-reminder stages already sent via Pushover
}

export type CreateTodoDto = Omit<Todo, 'id' | 'done' | 'createdAt' | 'updatedAt' | 'notifiedStages'>;
export type UpdateTodoDto = Partial<Omit<Todo, 'id' | 'createdAt' | 'updatedAt' | 'notifiedStages'>>;
