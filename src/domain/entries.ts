import { isLocalDate, isTimeOfDay, compareDates } from './dates';
import type { EntryInput, FieldDefinition, FieldValue, Habit, HabitEntry } from './types';

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
  // only keep values for done entries (skip/pause/postpone carry no measurements)
  const finalValues = input.status === 'done' ? values : {};
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
    completedAt: input.status === 'done' ? existing?.completedAt ?? now : null,
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
