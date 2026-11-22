import type { SupabaseClient } from '@supabase/supabase-js';
import { buildEntry, planStoragePath, validateCheckin, validateCycle, validateDaySchedule, validateHabitName, validatePlanUpload } from '../domain/entries';
import { DEFAULT_PROFILE, normalizeProfile } from '../domain/types';
import type {
  CheckinInput, CycleInput, DailyCheckin, DaySchedule, DayScheduleInput, EntryInput, FieldDefinition, FieldInput, Habit, HabitEntry,
  HabitInput, LocalDate, PhaseChange, PlanUploadInput, Profile, StepEntry, StepSource, Todo, TodoInput, TrainingCycle, TrainingPlan,
} from '../domain/types';
import { validateSteps } from '../domain/steps';
import { validateTodo } from '../domain/todos';
import { planFieldSync } from './fieldSync';
import { RepositoryError, type Repository, type Snapshot } from './repository';

type Row = Record<string, any>;

const t = (v: string | null | undefined) => (v ? v.slice(0, 5) : null); // "07:30:00" -> "07:30"

export const mapProfile = (r: Row): Profile => normalizeProfile({
  displayName: r.display_name, goals: r.goals ?? [], habitBacklog: r.habit_backlog ?? [], mode: r.mode, locale: r.locale, timezone: r.timezone,
  defaultReminderTime: t(r.default_reminder_time), phaseThreshold: Number(r.phase_threshold),
  phaseWindowDays: r.phase_window_days, onboardingCompleted: r.onboarding_completed,
  trainingLevel: r.training_level ?? null, trainingGoals: r.training_goals ?? [], startPreference: r.start_preference ?? null,
  trainingDays: r.training_days ?? [], trainingSettings: r.training_settings ?? [], trainingLimitations: r.training_limitations ?? '',
  communicationStyle: r.communication_style ?? 'supportive', features: r.features ?? undefined, healthConsentAt: r.health_consent_at ?? null,
  // step settings live in the free-form features JSON (no extra column needed)
  stepSettings: r.features?.stepSettings ?? undefined,
  dayRhythm: r.day_rhythm ?? 'standard', anchors: r.day_anchors ?? undefined, dayStartHour: r.day_start_hour ?? DEFAULT_PROFILE.dayStartHour,
});
const profileRow = (p: Profile) => ({
  display_name: p.displayName, goals: p.goals, habit_backlog: p.habitBacklog, mode: p.mode, locale: p.locale, timezone: p.timezone,
  default_reminder_time: p.defaultReminderTime, phase_threshold: p.phaseThreshold,
  phase_window_days: p.phaseWindowDays, onboarding_completed: p.onboardingCompleted,
  training_level: p.trainingLevel, training_goals: p.trainingGoals, start_preference: p.startPreference, training_days: p.trainingDays,
  training_settings: p.trainingSettings, training_limitations: p.trainingLimitations, communication_style: p.communicationStyle,
  features: { ...p.features, stepSettings: p.stepSettings }, health_consent_at: p.healthConsentAt, day_rhythm: p.dayRhythm, day_anchors: p.anchors, day_start_hour: p.dayStartHour,
});

export const mapHabit = (r: Row): Habit => ({
  id: r.id, name: r.name, category: r.category, icon: r.icon, description: r.description, goal: r.goal,
  scheduleType: r.schedule_type, weekdays: r.weekdays, timesPerWeek: r.times_per_week,
  reminderTime: t(r.reminder_time), reminderEnabled: r.reminder_enabled, startDate: r.start_date,
  phase: r.phase, status: r.status, pausePeriods: r.pause_periods ?? [], sortOrder: r.sort_order,
  phaseSuggestionDismissedUntil: r.phase_suggestion_dismissed_until, createdAt: r.created_at, updatedAt: r.updated_at,
  kind: r.kind ?? 'habit', reminderAnchor: r.reminder_anchor ?? null, reminderOffsetMin: r.reminder_offset_min ?? 0,
});
const habitRow = (h: Partial<HabitInput>) => {
  const m: Row = {
    name: h.name, category: h.category, icon: h.icon, description: h.description, goal: h.goal,
    schedule_type: h.scheduleType, weekdays: h.weekdays, times_per_week: h.timesPerWeek,
    reminder_time: h.reminderTime, reminder_enabled: h.reminderEnabled, start_date: h.startDate,
    phase: h.phase, status: h.status, pause_periods: h.pausePeriods, sort_order: h.sortOrder,
    phase_suggestion_dismissed_until: h.phaseSuggestionDismissedUntil,
    kind: h.kind, reminder_anchor: h.reminderAnchor, reminder_offset_min: h.reminderOffsetMin,
  };
  Object.keys(m).forEach((k) => m[k] === undefined && delete m[k]);
  return m;
};

export const mapField = (r: Row): FieldDefinition => ({
  id: r.id, habitId: r.habit_id, key: r.key, label: r.label, type: r.type, unit: r.unit,
  minPhase: r.min_phase, sortOrder: r.sort_order, archived: r.archived,
});
const fieldRow = (f: FieldDefinition, userId: string) => ({
  id: f.id, user_id: userId, habit_id: f.habitId, key: f.key, label: f.label, type: f.type, unit: f.unit,
  min_phase: f.minPhase, sort_order: f.sortOrder, archived: f.archived,
});

export const mapEntry = (r: Row): HabitEntry => ({
  id: r.id, habitId: r.habit_id, localDate: r.local_date, status: r.status, postponedTo: r.postponed_to,
  values: r.field_values ?? {}, fieldSnapshot: r.field_snapshot ?? [], habitNameSnapshot: r.habit_name_snapshot,
  note: r.note, rpe: r.rpe ?? null, completedAt: r.completed_at, createdAt: r.created_at, updatedAt: r.updated_at,
});

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
export const mapCheckin = (r: Row): DailyCheckin => ({
  id: r.id, localDate: r.local_date, readiness: r.readiness, sleepHours: num(r.sleep_hours), sleepQuality: r.sleep_quality,
  stress: r.stress, soreness: r.soreness, symptoms: r.symptoms ?? [], redFlags: r.red_flags ?? [], note: r.note,
  createdAt: r.created_at, updatedAt: r.updated_at,
});
export const mapCycle = (r: Row): TrainingCycle => ({
  id: r.id, name: r.name, goal: r.goal, phase: r.phase, startDate: r.start_date, endDate: r.end_date, sessionsPerWeek: r.sessions_per_week,
  restWeekdays: r.rest_weekdays ?? [], notes: r.notes, confirmedBy: r.confirmed_by, createdAt: r.created_at, updatedAt: r.updated_at,
});
export const mapTodo = (r: Row): Todo => ({
  id: r.id, title: r.title, dueDate: r.due_date, doneAt: r.done_at, note: r.note, createdAt: r.created_at, updatedAt: r.updated_at,
});
export const mapSteps = (r: Row): StepEntry => ({ id: r.id, localDate: r.local_date, steps: r.steps, source: r.source, updatedAt: r.updated_at });
export const PLAN_BUCKET = 'training-plans';
export const mapPlan = (r: Row): TrainingPlan => ({
  id: r.id, title: r.title, storagePath: r.storage_path, mimeType: r.mime_type, sizeBytes: r.size_bytes, note: r.note, createdAt: r.created_at,
});
export const mapDaySchedule = (r: Row): DaySchedule => ({
  id: r.id, localDate: r.local_date, shift: r.shift, anchors: r.anchors, createdAt: r.created_at, updatedAt: r.updated_at,
});

const mapPhaseChange = (r: Row): PhaseChange => ({
  id: r.id, habitId: r.habit_id, fromPhase: r.from_phase, toPhase: r.to_phase, reason: r.reason, createdAt: r.created_at,
});

function checkMaybe<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new RepositoryError(res.error.message, res.error);
  return res.data;
}

function check<T>(res: { data: T; error: { message: string } | null }): NonNullable<T> {
  const data = checkMaybe(res);
  if (data === null || data === undefined) throw new RepositoryError('not_found');
  return data as NonNullable<T>;
}

/**
 * PostgreSQL via Supabase. Authorisation is enforced server-side by RLS
 * (user_id = auth.uid()); the client never holds service keys.
 */
export class SupabaseRepository implements Repository {
  readonly kind = 'supabase' as const;

  constructor(private readonly db: SupabaseClient, private readonly newId: () => string) {}

  private async userId(): Promise<string> {
    const { data } = await this.db.auth.getUser();
    if (!data.user) throw new RepositoryError('not_authenticated');
    return data.user.id;
  }

  async load(sinceDate: LocalDate): Promise<Snapshot> {
    const [p, h, f, e, c, ci, cy, ds, tp, td, st] = await Promise.all([
      this.db.from('profiles').select('*').maybeSingle(),
      this.db.from('habits').select('*').order('sort_order'),
      this.db.from('field_definitions').select('*').order('sort_order'),
      this.db.from('habit_entries').select('*').gte('local_date', sinceDate),
      this.db.from('habit_phase_changes').select('*').order('created_at'),
      this.db.from('daily_checkins').select('*').gte('local_date', sinceDate),
      this.db.from('training_cycles').select('*').order('start_date'),
      this.db.from('day_schedules').select('*').gte('local_date', sinceDate),
      this.db.from('training_plans').select('*').order('created_at', { ascending: false }),
      // open to-dos + those done within the history window
      this.db.from('todos').select('*').or(`done_at.is.null,done_at.gte.${sinceDate}`),
      this.db.from('daily_steps').select('*').gte('local_date', sinceDate),
    ]);
    const profileRowData = checkMaybe(p);
    return {
      profile: profileRowData ? mapProfile(profileRowData) : { ...DEFAULT_PROFILE },
      habits: check(h).map(mapHabit),
      fields: check(f).map(mapField),
      entries: check(e).map(mapEntry),
      phaseChanges: check(c).map(mapPhaseChange),
      checkins: check(ci).map(mapCheckin),
      cycles: check(cy).map(mapCycle),
      daySchedules: check(ds).map(mapDaySchedule),
      // optional module: if migration 3 is missing the app still loads (uploads then report an error)
      trainingPlans: tp.error ? [] : (tp.data ?? []).map(mapPlan),
      // optional module: tolerated if migration 4 is missing
      todos: td.error ? [] : (td.data ?? []).map(mapTodo),
      steps: st.error ? [] : (st.data ?? []).map(mapSteps),
    };
  }

  async saveProfile(p: Profile): Promise<Profile> {
    const user_id = await this.userId();
    const row = check(await this.db.from('profiles').upsert({ user_id, ...profileRow(p) }).select().single());
    return mapProfile(row);
  }

  async createHabit(input: HabitInput, fields: FieldInput[]) {
    const user_id = await this.userId();
    const id = this.newId();
    const row = check(
      await this.db.from('habits').insert({ id, user_id, ...habitRow({ ...input, name: validateHabitName(input.name) }) }).select().single(),
    );
    const plan = planFieldSync(id, [], fields, [], this.newId);
    if (plan.upsert.length) {
      const res = await this.db.from('field_definitions').insert(plan.upsert.map((f) => fieldRow(f, user_id)));
      if (res.error) {
        await this.db.from('habits').delete().eq('id', id); // compensate – no half-created habit
        throw new RepositoryError(res.error.message, res.error);
      }
    }
    return { habit: mapHabit(row), fields: plan.upsert };
  }

  async updateHabit(id: string, patch: Partial<HabitInput>, fields?: FieldInput[]) {
    const user_id = await this.userId();
    if (patch.name !== undefined) patch = { ...patch, name: validateHabitName(patch.name) };
    const row = check(await this.db.from('habits').update(habitRow(patch)).eq('id', id).select().single());
    if (fields) {
      const current = check(await this.db.from('field_definitions').select('*').eq('habit_id', id)).map(mapField);
      const used = check(await this.db.from('habit_entries').select('habit_id, field_values').eq('habit_id', id))
        .map((r: Row) => ({ habitId: r.habit_id, values: r.field_values })) as HabitEntry[];
      const plan = planFieldSync(id, current, fields, used, this.newId);
      if (plan.remove.length) checkMaybe(await this.db.from('field_definitions').delete().in('id', plan.remove));
      if (plan.archive.length) checkMaybe(await this.db.from('field_definitions').update({ archived: true }).in('id', plan.archive));
      if (plan.upsert.length) checkMaybe(await this.db.from('field_definitions').upsert(plan.upsert.map((f) => fieldRow(f, user_id))));
    }
    const all = check(await this.db.from('field_definitions').select('*').eq('habit_id', id)).map(mapField);
    return { habit: mapHabit(row), fields: all };
  }

  async deleteHabit(id: string) {
    checkMaybe(await this.db.from('habits').delete().eq('id', id));
  }

  async upsertEntry(input: EntryInput): Promise<HabitEntry> {
    const user_id = await this.userId();
    const [h, f, e] = await Promise.all([
      this.db.from('habits').select('*').eq('id', input.habitId).single(),
      this.db.from('field_definitions').select('*').eq('habit_id', input.habitId),
      this.db.from('habit_entries').select('*').eq('habit_id', input.habitId).eq('local_date', input.localDate).maybeSingle(),
    ]);
    const existingRow = checkMaybe(e);
    const entry = buildEntry(input, mapHabit(check(h)), check(f).map(mapField), existingRow ? mapEntry(existingRow) : null, {
      newId: this.newId,
      now: () => new Date().toISOString(),
    });
    const row = check(
      await this.db
        .from('habit_entries')
        .upsert(
          {
            id: entry.id, user_id, habit_id: entry.habitId, local_date: entry.localDate, status: entry.status,
            postponed_to: entry.postponedTo, field_values: entry.values, field_snapshot: entry.fieldSnapshot,
            habit_name_snapshot: entry.habitNameSnapshot, note: entry.note, rpe: entry.rpe, completed_at: entry.completedAt,
          },
          { onConflict: 'habit_id,local_date' },
        )
        .select()
        .single(),
    );
    return mapEntry(row);
  }

  async deleteEntry(habitId: string, localDate: LocalDate) {
    checkMaybe(await this.db.from('habit_entries').delete().eq('habit_id', habitId).eq('local_date', localDate));
  }

  async addPhaseChange(c: Omit<PhaseChange, 'id' | 'createdAt'>) {
    const user_id = await this.userId();
    const row = check(
      await this.db.from('habit_phase_changes')
        .insert({ user_id, habit_id: c.habitId, from_phase: c.fromPhase, to_phase: c.toPhase, reason: c.reason })
        .select().single(),
    );
    return mapPhaseChange(row);
  }

  async upsertCheckin(input: CheckinInput): Promise<DailyCheckin> {
    const user_id = await this.userId();
    const c = validateCheckin(input);
    const row = check(
      await this.db.from('daily_checkins').upsert({
        user_id, local_date: c.localDate, readiness: c.readiness, sleep_hours: c.sleepHours, sleep_quality: c.sleepQuality, stress: c.stress,
        soreness: c.soreness, symptoms: c.symptoms, red_flags: c.redFlags, note: c.note,
      }, { onConflict: 'user_id,local_date' }).select().single(),
    );
    return mapCheckin(row);
  }

  async deleteCheckin(localDate: LocalDate) {
    checkMaybe(await this.db.from('daily_checkins').delete().eq('local_date', localDate));
  }

  async deleteAllCheckins() {
    const user_id = await this.userId();
    checkMaybe(await this.db.from('daily_checkins').delete().eq('user_id', user_id));
  }

  async saveCycle(input: CycleInput, id?: string): Promise<TrainingCycle> {
    const user_id = await this.userId();
    const c = validateCycle(input);
    const row = check(
      await this.db.from('training_cycles').upsert({
        id: id ?? this.newId(), user_id, name: c.name, goal: c.goal, phase: c.phase, start_date: c.startDate, end_date: c.endDate,
        sessions_per_week: c.sessionsPerWeek, rest_weekdays: c.restWeekdays, notes: c.notes, confirmed_by: c.confirmedBy,
      }).select().single(),
    );
    return mapCycle(row);
  }

  async deleteCycle(id: string) {
    checkMaybe(await this.db.from('training_cycles').delete().eq('id', id));
  }

  async upsertDaySchedule(input: DayScheduleInput): Promise<DaySchedule> {
    const user_id = await this.userId();
    const s = validateDaySchedule(input);
    const row = check(
      await this.db.from('day_schedules').upsert({ user_id, local_date: s.localDate, shift: s.shift, anchors: s.anchors }, { onConflict: 'user_id,local_date' })
        .select().single(),
    );
    return mapDaySchedule(row);
  }

  async deleteDaySchedule(localDate: LocalDate) {
    checkMaybe(await this.db.from('day_schedules').delete().eq('local_date', localDate));
  }

  async saveSteps(localDate: LocalDate, steps: number, source: StepSource): Promise<StepEntry> {
    const user_id = await this.userId();
    const row = check(
      await this.db.from('daily_steps').upsert({ user_id, local_date: localDate, steps: validateSteps(steps), source }, { onConflict: 'user_id,local_date,source' })
        .select().single(),
    );
    return mapSteps(row);
  }

  async deleteSteps(localDate: LocalDate, source: StepSource) {
    checkMaybe(await this.db.from('daily_steps').delete().eq('local_date', localDate).eq('source', source));
  }

  async saveTodo(input: TodoInput, id?: string): Promise<Todo> {
    const user_id = await this.userId();
    const v = validateTodo(input);
    const row = { title: v.title, due_date: v.dueDate, note: v.note };
    const res = id
      ? await this.db.from('todos').update(row).eq('id', id).select().single()
      : await this.db.from('todos').insert({ id: this.newId(), user_id, ...row }).select().single();
    return mapTodo(check(res));
  }

  async setTodoDone(id: string, done: boolean): Promise<Todo> {
    return mapTodo(check(await this.db.from('todos').update({ done_at: done ? new Date().toISOString() : null }).eq('id', id).select().single()));
  }

  async deleteTodo(id: string) {
    checkMaybe(await this.db.from('todos').delete().eq('id', id));
  }

  async uploadPlan(input: PlanUploadInput): Promise<TrainingPlan> {
    const user_id = await this.userId();
    const v = validatePlanUpload({ title: input.title, fileName: input.fileName, mimeType: input.mimeType, size: input.bytes.byteLength });
    const id = this.newId();
    const path = planStoragePath(user_id, id, v.mimeType);
    const up = await this.db.storage.from(PLAN_BUCKET).upload(path, input.bytes, { contentType: v.mimeType, upsert: false });
    if (up.error) throw new RepositoryError(up.error.message, up.error);
    const res = await this.db.from('training_plans')
      .insert({ id, user_id, title: v.title, storage_path: path, mime_type: v.mimeType, size_bytes: input.bytes.byteLength }).select().single();
    if (res.error) {
      await this.db.storage.from(PLAN_BUCKET).remove([path]); // compensate – no orphaned file
      throw new RepositoryError(res.error.message, res.error);
    }
    return mapPlan(res.data);
  }

  async planUrl(plan: TrainingPlan): Promise<string> {
    const { data, error } = await this.db.storage.from(PLAN_BUCKET).createSignedUrl(plan.storagePath, 300);
    if (error || !data) throw new RepositoryError(error?.message ?? 'not_found', error);
    return data.signedUrl;
  }

  async deletePlan(plan: TrainingPlan) {
    const rm = await this.db.storage.from(PLAN_BUCKET).remove([plan.storagePath]);
    if (rm.error) throw new RepositoryError(rm.error.message, rm.error);
    checkMaybe(await this.db.from('training_plans').delete().eq('id', plan.id));
  }

  async deleteAllData() {
    // files are not covered by the database cascade → delete them first
    const user_id = await this.userId();
    const list = await this.db.storage.from(PLAN_BUCKET).list(user_id, { limit: 1000 });
    if (list.data?.length) await this.db.storage.from(PLAN_BUCKET).remove(list.data.map((f) => `${user_id}/${f.name}`));
    const res = await this.db.rpc('delete_my_account');
    if (res.error) throw new RepositoryError(res.error.message, res.error);
    await this.db.auth.signOut();
  }

  async exportAll() {
    return this.load('1900-01-01');
  }
}
