import { doneDay, openTodos, todosForDay, validateTodo } from '../todos';
import type { Todo } from '../types';
import { LocalRepository, MemoryStore } from '../../data/localRepository';
import { seqId } from '../../test/fixtures';

const td = (id: string, over: Partial<Todo> = {}): Todo => ({ id, title: id, dueDate: null, doneAt: null, note: '', createdAt: id, updatedAt: '', ...over });
const TODAY = '2026-11-20';

describe('to-dos', () => {
  it('today shows undated, due-today and overdue (neutral) open tasks; other days only their own', () => {
    const list = [td('a'), td('b', { dueDate: TODAY }), td('c', { dueDate: '2026-11-18' }), td('d', { dueDate: '2026-11-25' })];
    const today = todosForDay(list, TODAY, TODAY, 3);
    expect(today.map((x) => x.todo.id)).toEqual(['c', 'b', 'a']);
    expect(today.find((x) => x.todo.id === 'c')?.overdue).toBe(true);
    expect(todosForDay(list, '2026-11-25', TODAY, 3).map((x) => x.todo.id)).toEqual(['d']);
  });

  it('done tasks appear on the (logical) day they were ticked off – also after midnight for night shifts', () => {
    const t = td('x', { doneAt: new Date(2026, 10, 21, 2, 0).toISOString() });
    expect(doneDay(t, 3)).toBe('2026-11-20'); // 02:00 still belongs to the 20th with day start 03:00
    expect(todosForDay([t], TODAY, TODAY, 3)).toHaveLength(1);
    expect(openTodos([t, td('y')]).map((x) => x.id)).toEqual(['y']);
  });

  it('validates title and date', () => {
    expect(() => validateTodo({ title: '  ', dueDate: null, note: '' })).toThrow('required');
    expect(() => validateTodo({ title: 'x', dueDate: '2026-02-30', note: '' })).toThrow('invalid_date');
    expect(validateTodo({ title: '  Physio  ', dueDate: null, note: '' }).title).toBe('Physio');
  });

  it('local repository: add, tick off, reopen, delete; old data without todos still loads', async () => {
    const store = new MemoryStore();
    await store.setItem('leveld.v1.data', JSON.stringify({ schemaVersion: 2, habits: [], entries: [] }));
    const repo = new LocalRepository(store, seqId);
    expect((await repo.load('2026-01-01')).todos).toEqual([]);
    const t = await repo.saveTodo({ title: 'Schuhe kaufen', dueDate: TODAY, note: '' });
    expect((await repo.setTodoDone(t.id, true)).doneAt).not.toBeNull();
    expect((await repo.setTodoDone(t.id, false)).doneAt).toBeNull();
    await repo.deleteTodo(t.id);
    expect((await repo.load('2026-01-01')).todos).toEqual([]);
  });
});
