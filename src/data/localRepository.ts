import { buildEntry, validateHabitName } from '../domain/entries';
import { DEFAULT_PROFILE } from '../domain/types';
import type { EntryInput, FieldInput, Habit, HabitInput, LocalDate, PhaseChange, Profile } from '../domain/types';
import { planFieldSync } from './fieldSync';
import { RepositoryError, type Repository, type Snapshot } from './repository';

export interface KeyValueStore {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

const KEY = 'leveld.v1.data';
const SCHEMA_VERSION = 1;

interface Stored extends Snapshot {
  schemaVersion: number;
}

/**
 * On-device persistence. The whole dataset is a single JSON document, written
 * atomically after each change through a serialized queue (no lost updates).
 */
export class LocalRepository implements Repository {
  readonly kind = 'local' as const;
  private cache: Stored | null = null;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly store: KeyValueStore,
    private readonly newId: () => string,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  private async read(): Promise<Stored> {
    if (this.cache) return this.cache;
    const raw = await this.store.getItem(KEY);
    if (!raw) {
      this.cache = { schemaVersion: SCHEMA_VERSION, profile: { ...DEFAULT_PROFILE }, habits: [], fields: [], entries: [], phaseChanges: [] };
      return this.cache;
    }
    try {
      const parsed = JSON.parse(raw) as Stored;
      this.cache = {
        ...parsed,
        profile: { ...DEFAULT_PROFILE, ...parsed.profile },
        habits: parsed.habits.map((h) => ({ ...h, pausePeriods: h.pausePeriods ?? [] })),
      };
      return this.cache;
    } catch (e) {
      throw new RepositoryError('local_data_corrupt', e);
    }
  }

  /** Runs a mutation on a copy and persists it; cache only updated if write succeeds. */
  private mutate<T>(fn: (draft: Stored) => T): Promise<T> {
    const run = async () => {
      const current = await this.read();
      const draft: Stored = clone(current);
      const result = fn(draft);
      await this.store.setItem(KEY, JSON.stringify(draft));
      this.cache = draft;
      return result;
    };
    const p = this.queue.then(run, run);
    this.queue = p.catch(() => undefined);
    return p;
  }

  async load(sinceDate: LocalDate): Promise<Snapshot> {
    const d = await this.read();
    return clone({ ...d, entries: d.entries.filter((e) => e.localDate >= sinceDate) });
  }

  saveProfile(p: Profile): Promise<Profile> {
    return this.mutate((d) => {
      d.profile = { ...p };
      return d.profile;
    });
  }

  createHabit(input: HabitInput, fields: FieldInput[]) {
    return this.mutate((d) => {
      const now = this.now();
      const habit: Habit = {
        ...input,
        name: validateHabitName(input.name),
        pausePeriods: input.pausePeriods ?? [],
        phaseSuggestionDismissedUntil: input.phaseSuggestionDismissedUntil ?? null,
        id: this.newId(),
        createdAt: now,
        updatedAt: now,
      };
      const plan = planFieldSync(habit.id, [], fields, [], this.newId);
      d.habits.push(habit);
      d.fields.push(...plan.upsert);
      return clone({ habit, fields: plan.upsert });
    });
  }

  updateHabit(id: string, patch: Partial<HabitInput>, fields?: FieldInput[]) {
    return this.mutate((d) => {
      const i = d.habits.findIndex((h) => h.id === id);
      if (i < 0) throw new RepositoryError('habit_not_found');
      const next: Habit = { ...d.habits[i], ...patch, id, updatedAt: this.now() };
      next.name = validateHabitName(next.name);
      d.habits[i] = next;
      if (fields) {
        const plan = planFieldSync(id, d.fields, fields, d.entries, this.newId);
        d.fields = d.fields
          .filter((f) => !plan.remove.includes(f.id) && !plan.upsert.some((u) => u.id === f.id))
          .map((f) => (plan.archive.includes(f.id) ? { ...f, archived: true } : f));
        d.fields.push(...plan.upsert);
      }
      return clone({ habit: next, fields: d.fields.filter((f) => f.habitId === id) });
    });
  }

  deleteHabit(id: string): Promise<void> {
    return this.mutate((d) => {
      d.habits = d.habits.filter((h) => h.id !== id);
      d.fields = d.fields.filter((f) => f.habitId !== id);
      d.entries = d.entries.filter((e) => e.habitId !== id);
      d.phaseChanges = d.phaseChanges.filter((c) => c.habitId !== id);
    });
  }

  upsertEntry(input: EntryInput) {
    return this.mutate((d) => {
      const habit = d.habits.find((h) => h.id === input.habitId);
      if (!habit) throw new RepositoryError('habit_not_found');
      const i = d.entries.findIndex((e) => e.habitId === input.habitId && e.localDate === input.localDate);
      const existing = i >= 0 ? d.entries[i] : null;
      const entry = buildEntry(input, habit, d.fields, existing, { newId: this.newId, now: this.now });
      if (i >= 0) d.entries[i] = entry;
      else d.entries.push(entry);
      return clone(entry);
    });
  }

  deleteEntry(habitId: string, localDate: LocalDate): Promise<void> {
    return this.mutate((d) => {
      d.entries = d.entries.filter((e) => !(e.habitId === habitId && e.localDate === localDate));
    });
  }

  addPhaseChange(c: Omit<PhaseChange, 'id' | 'createdAt'>) {
    return this.mutate((d) => {
      const change: PhaseChange = { ...c, id: this.newId(), createdAt: this.now() };
      d.phaseChanges.push(change);
      return change;
    });
  }

  async deleteAllData(): Promise<void> {
    await this.queue;
    await this.store.removeItem(KEY);
    this.cache = null;
  }

  async exportAll(): Promise<Snapshot> {
    const d = await this.read();
    return clone(d);
  }
}

export class MemoryStore implements KeyValueStore {
  data = new Map<string, string>();
  failNextWrite = false;
  async getItem(k: string) { return this.data.get(k) ?? null; }
  async setItem(k: string, v: string) {
    if (this.failNextWrite) { this.failNextWrite = false; throw new Error('disk full'); }
    this.data.set(k, v);
  }
  async removeItem(k: string) { this.data.delete(k); }
}
