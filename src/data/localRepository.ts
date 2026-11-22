import { buildEntry, validateCheckin, validateCycle, validateDaySchedule, validateHabitName } from '../domain/entries';
import { DEFAULT_PROFILE, normalizeHabit, normalizeProfile } from '../domain/types';
import type {
  CheckinInput, CycleInput, DailyCheckin, DaySchedule, DayScheduleInput, EntryInput, FieldInput, Habit, HabitInput, LocalDate, PhaseChange,
  Profile, StepEntry, StepSource, Todo, TodoInput, TrainingCycle, TrainingPlan,
} from '../domain/types';
import { validateSteps } from '../domain/steps';
import { validateTodo } from '../domain/todos';
import { planFieldSync } from './fieldSync';
import { RepositoryError, type Repository, type Snapshot } from './repository';

export interface KeyValueStore {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

const KEY = 'leveld.v1.data';
/** 2 = levels, check-ins, cycles, day schedules (v1 data is upgraded on read) */
const SCHEMA_VERSION = 2;

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
      this.cache = {
        schemaVersion: SCHEMA_VERSION, profile: { ...DEFAULT_PROFILE }, habits: [], fields: [], entries: [], phaseChanges: [],
        checkins: [], cycles: [], daySchedules: [], trainingPlans: [], todos: [], steps: [],
      };
      return this.cache;
    }
    try {
      const parsed = JSON.parse(raw) as Partial<Stored>;
      // upgrade data written by older app versions – nothing is lost, new fields get defaults
      this.cache = {
        schemaVersion: SCHEMA_VERSION,
        profile: normalizeProfile(parsed.profile),
        habits: (parsed.habits ?? []).map((h) => normalizeHabit(h)),
        fields: parsed.fields ?? [],
        entries: (parsed.entries ?? []).map((e) => ({ ...e, rpe: e.rpe ?? null })),
        phaseChanges: parsed.phaseChanges ?? [],
        checkins: parsed.checkins ?? [],
        cycles: parsed.cycles ?? [],
        daySchedules: parsed.daySchedules ?? [],
        trainingPlans: parsed.trainingPlans ?? [],
        todos: parsed.todos ?? [],
        steps: parsed.steps ?? [],
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
    return clone({ ...d, entries: d.entries.filter((e) => e.localDate >= sinceDate), steps: d.steps.filter((e) => e.localDate >= sinceDate) });
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
        ...normalizeHabit(input),
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

  upsertCheckin(input: CheckinInput): Promise<DailyCheckin> {
    return this.mutate((d) => {
      const v = validateCheckin(input);
      const i = d.checkins.findIndex((c) => c.localDate === v.localDate);
      const now = this.now();
      const next: DailyCheckin = { ...v, id: i >= 0 ? d.checkins[i].id : this.newId(), createdAt: i >= 0 ? d.checkins[i].createdAt : now, updatedAt: now };
      if (i >= 0) d.checkins[i] = next;
      else d.checkins.push(next);
      return clone(next);
    });
  }

  deleteCheckin(localDate: LocalDate): Promise<void> {
    return this.mutate((d) => { d.checkins = d.checkins.filter((c) => c.localDate !== localDate); });
  }

  deleteAllCheckins(): Promise<void> {
    return this.mutate((d) => { d.checkins = []; });
  }

  saveCycle(input: CycleInput, id?: string): Promise<TrainingCycle> {
    return this.mutate((d) => {
      const v = validateCycle(input);
      const i = id ? d.cycles.findIndex((c) => c.id === id) : -1;
      if (id && i < 0) throw new RepositoryError('cycle_not_found');
      const now = this.now();
      const next: TrainingCycle = { ...v, id: id ?? this.newId(), createdAt: i >= 0 ? d.cycles[i].createdAt : now, updatedAt: now };
      if (i >= 0) d.cycles[i] = next;
      else d.cycles.push(next);
      return clone(next);
    });
  }

  deleteCycle(id: string): Promise<void> {
    return this.mutate((d) => { d.cycles = d.cycles.filter((c) => c.id !== id); });
  }

  upsertDaySchedule(input: DayScheduleInput): Promise<DaySchedule> {
    return this.mutate((d) => {
      const v = validateDaySchedule(input);
      const i = d.daySchedules.findIndex((x) => x.localDate === v.localDate);
      const now = this.now();
      const next: DaySchedule = { ...v, id: i >= 0 ? d.daySchedules[i].id : this.newId(), createdAt: i >= 0 ? d.daySchedules[i].createdAt : now, updatedAt: now };
      if (i >= 0) d.daySchedules[i] = next;
      else d.daySchedules.push(next);
      return clone(next);
    });
  }

  deleteDaySchedule(localDate: LocalDate): Promise<void> {
    return this.mutate((d) => { d.daySchedules = d.daySchedules.filter((x) => x.localDate !== localDate); });
  }

  saveSteps(localDate: LocalDate, steps: number, source: StepSource): Promise<StepEntry> {
    return this.mutate((d) => {
      const v = validateSteps(steps);
      const i = d.steps.findIndex((x) => x.localDate === localDate && x.source === source);
      const next: StepEntry = { id: i >= 0 ? d.steps[i].id : this.newId(), localDate, steps: v, source, updatedAt: this.now() };
      if (i >= 0) d.steps[i] = next;
      else d.steps.push(next);
      return clone(next);
    });
  }

  deleteSteps(localDate: LocalDate, source: StepSource): Promise<void> {
    return this.mutate((d) => { d.steps = d.steps.filter((x) => !(x.localDate === localDate && x.source === source)); });
  }

  saveTodo(input: TodoInput, id?: string): Promise<Todo> {
    return this.mutate((d) => {
      const v = validateTodo(input);
      const i = id ? d.todos.findIndex((x) => x.id === id) : -1;
      if (id && i < 0) throw new RepositoryError('not_found');
      const now = this.now();
      const next: Todo = i >= 0 ? { ...d.todos[i], ...v, updatedAt: now } : { ...v, id: this.newId(), doneAt: null, createdAt: now, updatedAt: now };
      if (i >= 0) d.todos[i] = next;
      else d.todos.push(next);
      return clone(next);
    });
  }

  setTodoDone(id: string, done: boolean): Promise<Todo> {
    return this.mutate((d) => {
      const i = d.todos.findIndex((x) => x.id === id);
      if (i < 0) throw new RepositoryError('not_found');
      const now = this.now();
      d.todos[i] = { ...d.todos[i], doneAt: done ? now : null, updatedAt: now };
      return clone(d.todos[i]);
    });
  }

  deleteTodo(id: string): Promise<void> {
    return this.mutate((d) => { d.todos = d.todos.filter((x) => x.id !== id); });
  }

  /** Files are only stored in cloud mode (private bucket); local mode has no file storage. */
  async uploadPlan(): Promise<TrainingPlan> {
    throw new RepositoryError('upload_requires_account');
  }

  async planUrl(): Promise<string> {
    throw new RepositoryError('upload_requires_account');
  }

  deletePlan(plan: TrainingPlan): Promise<void> {
    return this.mutate((d) => { d.trainingPlans = d.trainingPlans.filter((x) => x.id !== plan.id); });
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
