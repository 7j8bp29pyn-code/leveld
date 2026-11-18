import { addDays, compareDates, isoWeekday } from './dates';
import type {
  CommunicationStyle, CyclePhase, DailyCheckin, DayAnchors, DayRhythm, FeatureFlags, FieldInput, LocalDate, Phase, Profile, StartPreference,
  TrainingCycle, TrainingLevel, Weekday,
} from './types';

/**
 * Entry logic per self-assessed training level. Levels only set DEFAULTS –
 * every feature can be switched on or off independently in the settings.
 * The level is a self-assessment, not a validated performance diagnosis.
 */
export interface LevelDefaults {
  features: Omit<FeatureFlags, 'checkin'>;
  /** Development phase new training habits start in (controls visible fields) */
  trainingPhase: Phase;
  /** Recommended number of active habits at the start (guided mode) */
  startLimit: number;
}

export const LEVEL_DEFAULTS: Record<TrainingLevel, LevelDefaults> = {
  beginner: { features: { detailedLogging: false, rpe: false, cycles: false }, trainingPhase: 1, startLimit: 2 },
  occasional: { features: { detailedLogging: false, rpe: false, cycles: false }, trainingPhase: 1, startLimit: 3 },
  regular: { features: { detailedLogging: true, rpe: true, cycles: false }, trainingPhase: 2, startLimit: 4 },
  structured: { features: { detailedLogging: true, rpe: true, cycles: true }, trainingPhase: 3, startLimit: 5 },
};

/**
 * Features after (re)choosing a level: level defaults are switched on, but nothing the
 * user switched on is taken away, and the health check-in is never touched (consent!).
 */
export function featuresForLevel(level: TrainingLevel, current: FeatureFlags): FeatureFlags {
  const d = LEVEL_DEFAULTS[level].features;
  return {
    detailedLogging: d.detailedLogging || current.detailedLogging,
    rpe: d.rpe || current.rpe,
    cycles: d.cycles || current.cycles,
    checkin: current.checkin,
  };
}

/** Default tracking fields for a NEW training habit. Beginners: none – just check it off. */
export function trainingFieldsFor(level: TrainingLevel | null, features: FeatureFlags): FieldInput[] {
  const f = (key: string, label: string, type: FieldInput['type'], unit: string, minPhase: Phase, sortOrder: number): FieldInput => ({
    key, label, type, unit, minPhase, sortOrder, archived: false,
  });
  if (!level || level === 'beginner') return [];
  const fields = [f('duration', 'Dauer', 'duration_min', 'min', 2, 0)];
  if (features.detailedLogging) {
    fields.push(
      f('exercises', 'Übungen', 'text', '', 2, 1),
      f('sets', 'Sätze', 'number', '', 2, 2),
      f('reps', 'Wiederholungen', 'number', '', 2, 3),
      f('weight', 'Gewicht', 'number', 'kg', 2, 4),
    );
  }
  if (level === 'structured') fields.push(f('volume', 'Belastung / Volumen', 'number', '', 3, 5));
  return fields;
}

export function currentCycle(cycles: TrainingCycle[], date: LocalDate): TrainingCycle | null {
  return (
    cycles
      .filter((c) => compareDates(c.startDate, date) <= 0 && compareDates(date, c.endDate) <= 0)
      .sort((a, b) => b.startDate.localeCompare(a.startDate))[0] ?? null
  );
}

export function isPlannedRestDay(cycle: TrainingCycle | null, date: LocalDate): boolean {
  return !!cycle && cycle.restWeekdays.includes(isoWeekday(date));
}

/** Phases in which no phase-up / progression suggestions are shown for training. */
export const NO_PROGRESSION_PHASES: CyclePhase[] = ['deload', 'maintain'];

export interface DeloadHint {
  exhaustedDays: number;
  windowDays: number;
}

/**
 * Suggest CONSIDERING a deload when, during a build/load block, the user reported
 * being strongly exhausted or ill on at least 3 of the last 7 days.
 * This is an orientation hint – it does NOT detect overtraining syndrome.
 * The user (or coach) decides and confirms any change.
 */
export function deloadHint(cycles: TrainingCycle[], checkins: DailyCheckin[], today: LocalDate): DeloadHint | null {
  const c = currentCycle(cycles, today);
  if (!c || (c.phase !== 'load' && c.phase !== 'build')) return null;
  const from = addDays(today, -6);
  const exhaustedDays = checkins.filter(
    (k) => k.localDate >= from && k.localDate <= today && (k.readiness === 'exhausted' || k.readiness === 'sick'),
  ).length;
  return exhaustedDays >= 3 ? { exhaustedDays, windowDays: 7 } : null;
}

export interface SetupAnswers {
  level: TrainingLevel | null; // null = skipped
  goals: string[];
  start: StartPreference | null;
  days: Weekday[];
  settings: string[];
  limitations: string;
  /** user ticked the consent box for the health check-in */
  checkin: boolean;
  style: CommunicationStyle;
  rhythm: DayRhythm;
  anchors: DayAnchors;
  dayStartHour: number;
}

/**
 * Profile changes for the answers of the onboarding / quick setup.
 * Skipped answers leave existing values untouched; nothing is assumed.
 * Health check-in is only enabled together with a consent timestamp.
 */
export function setupPatch(current: Profile, a: SetupAnswers, nowIso: string): Partial<Profile> {
  const features = a.level ? featuresForLevel(a.level, current.features) : { ...current.features };
  features.checkin = a.checkin;
  return {
    trainingLevel: a.level ?? current.trainingLevel,
    trainingGoals: a.goals,
    goals: a.goals.length ? a.goals : current.goals,
    startPreference: a.start ?? current.startPreference,
    trainingDays: a.days,
    trainingSettings: a.settings,
    trainingLimitations: a.limitations.trim(),
    communicationStyle: a.style,
    features,
    healthConsentAt: a.checkin ? current.healthConsentAt ?? nowIso : null,
    dayRhythm: a.rhythm,
    anchors: a.anchors,
    dayStartHour: a.dayStartHour,
  };
}
