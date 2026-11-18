import type {
  CheckinInput, CycleInput, DailyCheckin, DaySchedule, DayScheduleInput, EntryInput, FieldDefinition, FieldInput, Habit, HabitEntry,
  HabitInput, LocalDate, PhaseChange, Profile, TrainingCycle,
} from '../domain/types';

export interface Snapshot {
  profile: Profile;
  habits: Habit[];
  fields: FieldDefinition[];
  entries: HabitEntry[];
  phaseChanges: PhaseChange[];
  /** sensitive health data – separate from training level and habit entries */
  checkins: DailyCheckin[];
  cycles: TrainingCycle[];
  daySchedules: DaySchedule[];
}

/**
 * Storage abstraction. Implementations:
 *  - LocalRepository   – on-device (AsyncStorage), no account, data never leaves the device
 *  - SupabaseRepository – PostgreSQL with Row Level Security, per-user accounts
 * All writes resolve with the persisted state; callers update UI only on success.
 */
export interface Repository {
  readonly kind: 'local' | 'supabase';
  load(sinceDate: LocalDate): Promise<Snapshot>;
  saveProfile(p: Profile): Promise<Profile>;
  createHabit(input: HabitInput, fields: FieldInput[]): Promise<{ habit: Habit; fields: FieldDefinition[] }>;
  /** Replaces the habit's field definitions with `fields` (missing ones are archived if used in history, else deleted). */
  updateHabit(id: string, patch: Partial<HabitInput>, fields?: FieldInput[]): Promise<{ habit: Habit; fields: FieldDefinition[] }>;
  deleteHabit(id: string): Promise<void>;
  /** Insert or update the single entry for (habitId, localDate). */
  upsertEntry(input: EntryInput): Promise<HabitEntry>;
  deleteEntry(habitId: string, localDate: LocalDate): Promise<void>;
  addPhaseChange(c: Omit<PhaseChange, 'id' | 'createdAt'>): Promise<PhaseChange>;
  /** One check-in per logical day (upsert). */
  upsertCheckin(input: CheckinInput): Promise<DailyCheckin>;
  deleteCheckin(localDate: LocalDate): Promise<void>;
  /** Deletes ALL stored health check-ins (consent withdrawal). */
  deleteAllCheckins(): Promise<void>;
  saveCycle(input: CycleInput, id?: string): Promise<TrainingCycle>;
  deleteCycle(id: string): Promise<void>;
  upsertDaySchedule(input: DayScheduleInput): Promise<DaySchedule>;
  deleteDaySchedule(localDate: LocalDate): Promise<void>;
  /** GDPR: deletes all data of the current user (and the account for Supabase). */
  deleteAllData(): Promise<void>;
  /** Machine-readable export of all stored data (JSON). */
  exportAll(): Promise<Snapshot>;
}

export class RepositoryError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'RepositoryError';
  }
}
