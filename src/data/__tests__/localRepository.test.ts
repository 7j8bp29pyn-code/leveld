import { LocalRepository, MemoryStore } from '../localRepository';
import { habitInput, seqId } from '../../test/fixtures';
import { ValidationError } from '../../domain/entries';

function setup() {
  const store = new MemoryStore();
  let clock = 0;
  const repo = new LocalRepository(store, seqId, () => new Date(Date.UTC(2026, 10, 17, 0, 0, clock++)).toISOString());
  return { store, repo };
}

describe('LocalRepository', () => {
  it('persists across instances (reload)', async () => {
    const { store, repo } = setup();
    const { habit } = await repo.createHabit(habitInput({ name: 'Pole Dance' }), []);
    await repo.upsertEntry({ habitId: habit.id, localDate: '2026-11-17', status: 'done' });
    const fresh = new LocalRepository(store, seqId);
    const snap = await fresh.load('2026-01-01');
    expect(snap.habits.map((h) => h.name)).toEqual(['Pole Dance']);
    expect(snap.entries).toHaveLength(1);
  });

  it('never creates duplicate entries for the same habit and day; supports correction', async () => {
    const { repo } = setup();
    const { habit, fields } = await repo.createHabit(habitInput(), [
      { key: '', label: 'Dauer', type: 'duration_min', unit: 'min', minPhase: 1, sortOrder: 0, archived: false },
    ]);
    expect(fields[0].key).toBe('dauer');
    const first = await repo.upsertEntry({ habitId: habit.id, localDate: '2026-11-17', status: 'done', values: { dauer: '45' } });
    const second = await repo.upsertEntry({ habitId: habit.id, localDate: '2026-11-17', status: 'done', values: { dauer: '50,5' } });
    const snap = await repo.load('2026-01-01');
    expect(snap.entries).toHaveLength(1);
    expect(second.id).toBe(first.id);
    expect(second.values.dauer).toBe(50.5);
    expect(second.createdAt).toBe(first.createdAt);
    // undo
    await repo.deleteEntry(habit.id, '2026-11-17');
    expect((await repo.load('2026-01-01')).entries).toHaveLength(0);
  });

  it('keeps history readable after rename (Pole Dance → Tennis)', async () => {
    const { repo } = setup();
    const { habit } = await repo.createHabit(habitInput({ name: 'Pole Dance' }), []);
    await repo.upsertEntry({ habitId: habit.id, localDate: '2026-11-16', status: 'done' });
    await repo.updateHabit(habit.id, { name: 'Tennis' });
    await repo.upsertEntry({ habitId: habit.id, localDate: '2026-11-17', status: 'done' });
    const snap = await repo.load('2026-01-01');
    expect(snap.entries.map((e) => e.habitNameSnapshot).sort()).toEqual(['Pole Dance', 'Tennis']);
    expect(snap.habits[0].name).toBe('Tennis');
  });

  it('archives used fields instead of deleting them; deletes unused ones', async () => {
    const { repo } = setup();
    const { habit, fields } = await repo.createHabit(habitInput(), [
      { key: 'used', label: 'Used', type: 'number', unit: '', minPhase: 1, sortOrder: 0, archived: false },
      { key: 'unused', label: 'Unused', type: 'number', unit: '', minPhase: 1, sortOrder: 1, archived: false },
    ]);
    await repo.upsertEntry({ habitId: habit.id, localDate: '2026-11-17', status: 'done', values: { used: 3 } });
    const res = await repo.updateHabit(habit.id, {}, [
      { id: undefined, key: '', label: 'Neu', type: 'text', unit: '', minPhase: 2, sortOrder: 0, archived: false },
    ]);
    const byKey = Object.fromEntries(res.fields.map((f) => [f.key, f]));
    expect(byKey.used.archived).toBe(true);
    expect(byKey.unused).toBeUndefined();
    expect(byKey.neu.archived).toBe(false);
    expect(fields).toHaveLength(2);
  });

  it('validates input and rejects invalid postponements', async () => {
    const { repo } = setup();
    await expect(repo.createHabit(habitInput({ name: '   ' }), [])).rejects.toBeInstanceOf(ValidationError);
    const { habit } = await repo.createHabit(habitInput(), []);
    await expect(
      repo.upsertEntry({ habitId: habit.id, localDate: '2026-11-17', status: 'postponed', postponedTo: '2026-11-17' }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(repo.upsertEntry({ habitId: habit.id, localDate: '2026-11-17', status: 'done', values: { nope: 1 } })).rejects.toThrow(
      'unknown_field',
    );
  });

  it('does not change state when the write fails', async () => {
    const { store, repo } = setup();
    const { habit } = await repo.createHabit(habitInput(), []);
    store.failNextWrite = true;
    await expect(repo.upsertEntry({ habitId: habit.id, localDate: '2026-11-17', status: 'done' })).rejects.toThrow('disk full');
    expect((await repo.load('2026-01-01')).entries).toHaveLength(0);
    // queue still works afterwards
    await repo.upsertEntry({ habitId: habit.id, localDate: '2026-11-17', status: 'done' });
    expect((await repo.load('2026-01-01')).entries).toHaveLength(1);
  });

  it('serialises concurrent writes (no lost updates)', async () => {
    const { repo } = setup();
    const { habit } = await repo.createHabit(habitInput(), []);
    await Promise.all(
      ['2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13'].map((d) => repo.upsertEntry({ habitId: habit.id, localDate: d, status: 'done' })),
    );
    expect((await repo.load('2026-01-01')).entries).toHaveLength(4);
  });

  it('deletes all data (GDPR)', async () => {
    const { store, repo } = setup();
    await repo.createHabit(habitInput(), []);
    await repo.deleteAllData();
    expect(store.data.size).toBe(0);
    expect((await repo.load('2026-01-01')).habits).toHaveLength(0);
  });
});
