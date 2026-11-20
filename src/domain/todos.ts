import { compareDates, isLocalDate } from './dates';
import { ValidationError } from './entries';
import { logicalDate } from './rhythm';
import type { LocalDate, Todo, TodoInput } from './types';

/** Ideas the user can add with one tap (i18n keys under todos.suggestions). */
export const TODO_SUGGESTIONS = [
  'uploadPlan', 'checkup', 'weekPlan', 'shoes', 'measure', 'photo', 'mealPrep', 'bottle', 'bedtime', 'gymBag',
] as const;

export function validateTodo(t: TodoInput): TodoInput {
  const title = t.title.trim();
  if (!title) throw new ValidationError('title', 'required');
  if (title.length > 200) throw new ValidationError('title', 'too_long');
  if (t.dueDate !== null && !isLocalDate(t.dueDate)) throw new ValidationError('dueDate', 'invalid_date');
  return { title, dueDate: t.dueDate, note: t.note.slice(0, 2000) };
}

/** The (logical) day a to-do was ticked off. */
export function doneDay(t: Todo, dayStartHour: number): LocalDate | null {
  return t.doneAt ? logicalDate(new Date(t.doneAt), dayStartHour) : null;
}

export interface TodoItem {
  todo: Todo;
  /** open and due before `day` – shown neutrally ("since …"), never as failure */
  overdue: boolean;
}

/**
 * To-dos shown for a day: open ones that are due that day; on today additionally open
 * undated and overdue ones; plus the ones ticked off that day (so they can be undone).
 */
export function todosForDay(todos: Todo[], day: LocalDate, today: LocalDate, dayStartHour: number): TodoItem[] {
  const isToday = day === today;
  return todos
    .filter((t) => {
      if (t.doneAt) return doneDay(t, dayStartHour) === day;
      if (t.dueDate === day) return true;
      return isToday && (t.dueDate === null || compareDates(t.dueDate, today) < 0);
    })
    .map((todo) => ({ todo, overdue: !todo.doneAt && !!todo.dueDate && compareDates(todo.dueDate, day) < 0 }))
    .sort((a, b) =>
      Number(!!a.todo.doneAt) - Number(!!b.todo.doneAt)
      || (a.todo.dueDate ?? '9999').localeCompare(b.todo.dueDate ?? '9999')
      || a.todo.createdAt.localeCompare(b.todo.createdAt));
}

export function openTodos(todos: Todo[]): Todo[] {
  return todos.filter((t) => !t.doneAt).sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999') || a.createdAt.localeCompare(b.createdAt));
}
