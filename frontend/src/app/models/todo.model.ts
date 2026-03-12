export const TODO_CATEGORIES = [
  { id: 'maison',  label: 'Home',     icon: '🏠' },
  { id: 'voiture', label: 'Car',      icon: '🚗' },
  { id: 'travail', label: 'Work',     icon: '💼' },
  { id: 'courses', label: 'Shopping', icon: '🛒' },
  { id: 'enfants', label: 'Kids',     icon: '👶' },
  { id: 'sport',   label: 'Sport',    icon: '🏃' },
  { id: 'sante',   label: 'Health',   icon: '💊' },
  { id: 'finance', label: 'Finance',  icon: '💰' },
  { id: 'loisirs', label: 'Leisure',  icon: '🎉' },
] as const;

export type TodoCategory = typeof TODO_CATEGORIES[number]['id'];

export interface Todo {
  id: string;
  title: string;
  description: string;
  effort: number;       // 1 to 5
  priority: number;     // 1 to 5
  deadline: string | null; // ISO 8601 or null
  category: TodoCategory | null;
  done: boolean;
  createdAt: string;
  updatedAt: string;
}

export type CreateTodoDto = Omit<Todo, 'id' | 'done' | 'createdAt' | 'updatedAt'>;
export type UpdateTodoDto = Partial<Omit<Todo, 'id' | 'createdAt' | 'updatedAt'>>;
