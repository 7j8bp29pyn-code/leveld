import { isLocalDate, isTimeOfDay, compareDates } from './dates';
import {
  FULFILLED, type CheckinInput, type CycleInput, type DayScheduleInput, type EntryInput, type FieldDefinition, type FieldValue, type Habit, type HabitEntry,
} from './types';

export class ValidationError extends Error {
  constructor(public readonly field: string, message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

/** Validates & normalises one field value. Empty input → null (missing, not 0). */
export function normalizeFieldValue(def: Pick<FieldDefinition, 'key' | 'type'>, raw: unknown): FieldValue {
  if (raw === undefined || raw === null || raw === '') return null;
  switch (def.type) {
    case 'number':
    case 'duration_min': {
      const n = typeof raw === 'number' ? raw : Number(String(raw).trim().replace(',', '.'));
      if (!Number.isFinite(n)) throw new ValidationError(def.key, 'invalid_number');
      if (def.type === 'duration_min' && n < 0) throw new ValidationError(def.key, 'negative');
      return n;
    }
    case 'rating_1_5': {
      const n = Number(raw);
      if (!Number.isInteger(n) || n < 1 || n > 5) throw new ValidationError(def.key, 'invalid_rating');
      return n;
    }
    case 'boolean':
      if (typeof raw === 'boolean') return raw;
      throw new ValidationError(def.key, 'invalid_boolean');
    case 'time':
      if (isTimeOfDay(raw)) return raw;
      throw new ValidationError(def.key, 'invalid_time');
    case 'text': {
      const s = String(raw).trim();
      if (s.length > 500) throw new ValidationError(def.key, 'too_long');
      return s || null;
    }
  }
}

/**
 * Builds the full entry to persist. Keeps a snapshot of the habit name and field
 * definitions so history stays readable after renames or field changes.
 */
export function buildEntry(
  input: EntryInput,
  habit: Habit,
  fields: FieldDefinition[],
  existing: HabitEntry | null,
  ids: { newId: () => string; now: () => string },
): HabitEntry {
  if (!isLocalDate(input.localDate)) throw new ValidationError('localDate', 'invalid_date');
  if (input.habitId !== habit.id) throw new ValidationError('habitId', 'mismatch');
  let postponedTo: string | null = null;
  if (input.status === 'postponed') {
    if (!input.postponedTo || !isLocalDate(input.postponedTo) || compareDates(input.postponedTo, input.localDate) <= 0) {
      throw new ValidationError('postponedTo', 'postpone_target_must_be_later');
    }
    postponedTo = input.postponedTo;
  }
  const defs = fields.filter((f) => f.habitId === habit.id);
  const values: Record<string, FieldValue> = { ...(existing?.values ?? {}) };
  for (const [key, raw] of Object.entries(input.values ?? {})) {
    const def = defs.find((f) => f.key === key);
    if (!def) throw new ValidationError(key, 'unknown_field');
    const v = normalizeFieldValue(def, raw);
    if (v === null) delete values[key];
    else values[key] = v;
  }
  // only done/adapted sessions carry measurements (skip/pause/postpone/recovery/health_pause don't)
  const measured = input.status === 'done' || input.status === 'adapted';
  const finalValues = measured ? values : {};
  let rpe: number | null = input.rpe === undefined ? existing?.rpe ?? null : input.rpe;
  if (rpe !== null && (!Number.isInteger(rpe) || rpe < 1 || rpe > 10)) throw new ValidationError('rpe', 'invalid_rpe');
  if (!measured) rpe = null;
  const usedKeys = Object.keys(finalValues);
  const now = ids.now();
  return {
    id: existing?.id ?? ids.newId(),
    habitId: habit.id,
    localDate: input.localDate,
    status: input.status,
    postponedTo,
    values: finalValues,
    fieldSnapshot: defs.filter((d) => usedKeys.includes(d.key)).map((d) => ({ key: d.key, label: d.label, type: d.type, unit: d.unit })),
    habitNameSnapshot: habit.name,
    note: (input.note ?? existing?.note ?? '').slice(0, 2000),
    rpe,
    completedAt: FULFILLED.includes(input.status) ? existing?.completedAt ?? now : null,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
}

export function validateHabitName(name: string): string {
  const n = name.trim();
  if (!n) throw new ValidationError('name', 'required');
  if (n.length > 80) throw new ValidationError('name', 'too_long');
  return n;
}

const SYMPTOMS = ['sore_throat', 'fever', 'cough', 'other_symptoms', 'pain_injury'];
const RED_FLAGS = ['chest_pain', 'breathlessness', 'circulation'];
const inRange = (v: number | null, min: number, max: number, field: string, step = 1) => {
  if (v === null) return null;
  if (!Number.isFinite(v) || v < min || v > max || (step === 1 && !Number.isInteger(v))) throw new ValidationError(field, 'out_of_range');
  return v;
};

/** Validates a daily check-in. Optional values stay null (missing ≠ 0). */
export function validateCheckin(c: CheckinInput): CheckinInput {
  if (!isLocalDate(c.localDate)) throw new ValidationError('localDate', 'invalid_date');
  if (!['fit', 'tired', 'exhausted', 'sick'].includes(c.readiness)) throw new ValidationError('readiness', 'required');
  return {
    ...c,
    sleepHours: inRange(c.sleepHours, 0, 24, 'sleepHours', 0.1),
    sleepQuality: inRange(c.sleepQuality, 1, 5, 'sleepQuality'),
    stress: inRange(c.stress, 1, 5, 'stress'),
    soreness: inRange(c.soreness, 0, 3, 'soreness'),
    symptoms: [...new Set(c.symptoms)].filter((s) => SYMPTOMS.includes(s)),
    redFlags: [...new Set(c.redFlags)].filter((s) => RED_FLAGS.includes(s)),
    note: c.note.slice(0, 2000),
  };
}

export function validateCycle(c: CycleInput): CycleInput {
  const name = c.name.trim();
  if (!name) throw new ValidationError('name', 'required');
  if (!isLocalDate(c.startDate)) throw new ValidationError('startDate', 'invalid_date');
  if (!isLocalDate(c.endDate)) throw new ValidationError('endDate', 'invalid_date');
  if (compareDates(c.endDate, c.startDate) < 0) throw new ValidationError('endDate', 'end_before_start');
  return { ...c, name: name.slice(0, 80), sessionsPerWeek: inRange(c.sessionsPerWeek, 0, 14, 'sessionsPerWeek') };
}

export function validateDaySchedule(s: DayScheduleInput): DayScheduleInput {
  if (!isLocalDate(s.localDate)) throw new ValidationError('localDate', 'invalid_date');
  for (const k of ['wake', 'firstMeal', 'bedtime'] as const) if (!isTimeOfDay(s.anchors[k])) throw new ValidationError(k, 'invalid_time');
  if (s.anchors.workEnd !== null && !isTimeOfDay(s.anchors.workEnd)) throw new ValidationError('workEnd', 'invalid_time');
  return s;
}
