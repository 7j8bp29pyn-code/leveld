import { slugKey } from '../domain/phases';
import { ValidationError } from '../domain/entries';
import type { FieldDefinition, FieldInput, HabitEntry } from '../domain/types';

export interface FieldSyncPlan {
  upsert: FieldDefinition[];
  archive: string[]; // ids – used in history, kept for snapshots/exports
  remove: string[]; // ids – never used
}

/** Computes how to turn the stored field list into `inputs` without losing history. */
export function planFieldSync(
  habitId: string,
  current: FieldDefinition[],
  inputs: FieldInput[],
  entries: HabitEntry[],
  newId: () => string,
): FieldSyncPlan {
  const own = current.filter((f) => f.habitId === habitId);
  const usedKeys = new Set(entries.filter((e) => e.habitId === habitId).flatMap((e) => Object.keys(e.values)));
  const keys: string[] = [];
  const upsert: FieldDefinition[] = inputs.map((inp, i) => {
    const label = inp.label.trim();
    if (!label) throw new ValidationError('label', 'required');
    const existing = inp.id ? own.find((f) => f.id === inp.id) : undefined;
    // key is immutable once created so stored values stay attached
    const key = existing?.key ?? slugKey(inp.key || label, [...keys, ...own.map((f) => f.key)]);
    keys.push(key);
    return {
      id: existing?.id ?? newId(),
      habitId,
      key,
      label: label.slice(0, 60),
      type: existing && usedKeys.has(key) ? existing.type : inp.type, // type locked once data exists
      unit: inp.unit.trim().slice(0, 20),
      minPhase: inp.minPhase,
      sortOrder: i,
      archived: false,
    };
  });
  const keepIds = new Set(upsert.map((f) => f.id));
  const dropped = own.filter((f) => !keepIds.has(f.id));
  return {
    upsert,
    archive: dropped.filter((f) => usedKeys.has(f.key)).map((f) => f.id),
    remove: dropped.filter((f) => !usedKeys.has(f.key)).map((f) => f.id),
  };
}
