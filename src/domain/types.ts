/** ISO calendar date in the user's local time zone, e.g. "2026-11-17". */
export type LocalDate = string;
/** "HH:MM" 24h */
export type TimeOfDay = string;

export type Mode = 'guided' | 'custom';
export type Locale = 'de' | 'en' | 'pl' | 'ru';
export type Phase = 1 | 2 | 3 | 4 | 5;
export type HabitStatus = 'active' | 'paused' | 'archived';
export type ScheduleType = 'daily' | 'weekdays' | 'times_per_week';
/** ISO weekday 1 = Monday … 7 = Sunday */
export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;
/**
 * done        – carried out as planned
 * adapted     – carried out in an adapted (lighter/shorter) form → counts as fulfilled
 * recovery    – planned training consciously replaced by rest / active recovery → counts as fulfilled
 * health_pause– suspended for health reasons → never a failure, not counted
 * skipped     – left out without reason → not counted (no failure either)
 * paused / postponed – see schedule rules
 */
export type EntryStatus = 'done' | 'adapted' | 'recovery' | 'health_pause' | 'skipped' | 'paused' | 'postponed';
/** Statuses that count as fulfilled in rates and streaks. */
export const FULFILLED: EntryStatus[] = ['done', 'adapted', 'recovery'];
/** habit = general habit, training = load-bearing activity (check-in aware), recovery = planned regeneration task */
export type HabitKind = 'habit' | 'training' | 'recovery';

/** Self-assessment, NOT a validated performance diagnosis. */
export type TrainingLevel = 'beginner' | 'occasional' | 'regular' | 'structured';
export type StartPreference = 'existing_plan' | 'generate_plan' | 'habits_only';
export type CommunicationStyle = 'supportive' | 'humorous' | 'factual' | 'gym';
export type DayRhythm = 'standard' | 'early' | 'late' | 'night' | 'rotating' | 'custom';
export type ShiftType = 'early' | 'late' | 'night' | 'off' | 'custom';
export type ReminderAnchor = 'wake' | 'first_meal' | 'work_end' | 'bedtime';

/** Typical points of the user's day; times may lie after midnight (e.g. bedtime 01:00). */
export interface DayAnchors {
  wake: TimeOfDay;
  firstMeal: TimeOfDay;
  workEnd: TimeOfDay | null;
  bedtime: TimeOfDay;
}

/** Functions a user can switch on independently of the level. */
export interface FeatureFlags {
  /** Detailed metrics (sets, weights, distances …) pre-configured for new training habits */
  detailedLogging: boolean;
  /** Subjective exertion (RPE 1–10) on training entries */
  rpe: boolean;
  /** Training cycles / load & deload phases */
  cycles: boolean;
  /** Daily health & recovery check-in (requires explicit consent) */
  checkin: boolean;
}
export type FieldType = 'number' | 'duration_min' | 'text' | 'boolean' | 'time' | 'rating_1_5';

export interface Profile {
  displayName: string;
  goals: string[];
  /** Activity ideas kept for later (guided mode – Habit Expansion). */
  habitBacklog: string[];
  mode: Mode;
  locale: Locale;
  timezone: string;
  defaultReminderTime: TimeOfDay | null;
  /** Orientation value (not a scientific threshold) – configurable 0.5..1 */
  phaseThreshold: number;
  phaseWindowDays: number;
  onboardingCompleted: boolean;
  /** null = not yet asked (existing users before the update) */
  trainingLevel: TrainingLevel | null;
  trainingGoals: string[];
  startPreference: StartPreference | null;
  trainingDays: Weekday[];
  /** e.g. gym, home, outdoor */
  trainingSettings: string[];
  /** Voluntary, sensitive – free text about limitations. Empty = not provided. */
  trainingLimitations: string;
  communicationStyle: CommunicationStyle;
  features: FeatureFlags;
  /** ISO timestamp of consent to process health data (check-in); null = no consent */
  healthConsentAt: string | null;
  dayRhythm: DayRhythm;
  anchors: DayAnchors;
  /** Hour (0–14) at which the user's "day" starts – night shift workers can move it past midnight. */
  dayStartHour: number;
  stepSettings: StepSettings;
}

export interface StepSettings {
  /** daily step goal */
  goal: number;
  /** habits that are ticked off automatically once the day's steps reach minSteps (e.g. "Gassi") */
  autoHabits: { habitId: string; minSteps: number }[];
}

export type StepSource = 'manual' | 'apple_health' | 'health_connect';

/** Steps of one day from one source. Several sources per day are never added up. */
export interface StepEntry {
  id: string;
  localDate: LocalDate;
  steps: number;
  source: StepSource;
  updatedAt: string;
}

export type Readiness = 'fit' | 'tired' | 'exhausted' | 'sick';
export type Symptom = 'sore_throat' | 'fever' | 'cough' | 'other_symptoms' | 'pain_injury';
/** Warning signs that require urgent medical attention – never interpreted further. */
export type RedFlag = 'chest_pain' | 'breathlessness' | 'circulation';

/** Daily form – stored separately from training level and habit entries (sensitive health data). */
export interface DailyCheckin {
  id: string;
  localDate: LocalDate;
  readiness: Readiness;
  sleepHours: number | null;
  sleepQuality: number | null; // 1–5
  stress: number | null; // 1–5
  soreness: number | null; // 0–3
  symptoms: Symptom[];
  redFlags: RedFlag[];
  note: string;
  createdAt: string;
  updatedAt: string;
}

export type CheckinInput = Omit<DailyCheckin, 'id' | 'createdAt' | 'updatedAt'>;

export type CyclePhase = 'build' | 'load' | 'deload' | 'maintain';

/** Manually configured training block – never generated unchecked by AI. */
export interface TrainingCycle {
  id: string;
  name: string;
  goal: string;
  phase: CyclePhase;
  startDate: LocalDate;
  endDate: LocalDate;
  sessionsPerWeek: number | null;
  restWeekdays: Weekday[];
  notes: string;
  confirmedBy: 'user' | 'coach';
  createdAt: string;
  updatedAt: string;
}

export type CycleInput = Omit<TrainingCycle, 'id' | 'createdAt' | 'updatedAt'>;

/** Per-day override for rotating / irregular shifts. */
export interface DaySchedule {
  id: string;
  localDate: LocalDate;
  shift: ShiftType;
  anchors: DayAnchors;
  createdAt: string;
  updatedAt: string;
}

export type DayScheduleInput = Omit<DaySchedule, 'id' | 'createdAt' | 'updatedAt'>;

export interface FieldDefinition {
  id: string;
  habitId: string;
  key: string;
  label: string;
  type: FieldType;
  unit: string;
  minPhase: Phase;
  sortOrder: number;
  archived: boolean;
}

export interface Habit {
  id: string;
  name: string;
  category: string;
  icon: string;
  description: string;
  goal: string;
  scheduleType: ScheduleType;
  weekdays: Weekday[];
  timesPerWeek: number | null;
  reminderTime: TimeOfDay | null;
  reminderEnabled: boolean;
  /** Relative reminder (e.g. 30 min after waking). null = fixed reminderTime. */
  reminderAnchor: ReminderAnchor | null;
  reminderOffsetMin: number;
  kind: HabitKind;
  startDate: LocalDate;
  phase: Phase;
  status: HabitStatus;
  /** Inclusive periods; end null = still paused. Paused days never count as failure. */
  pausePeriods: PausePeriod[];
  sortOrder: number;
  phaseSuggestionDismissedUntil: LocalDate | null;
  createdAt: string;
  updatedAt: string;
}

export interface PausePeriod {
  start: LocalDate;
  end: LocalDate | null;
}

export type FieldValue = number | string | boolean | null;

export interface FieldSnapshot {
  key: string;
  label: string;
  type: FieldType;
  unit: string;
}

export interface HabitEntry {
  id: string;
  habitId: string;
  localDate: LocalDate;
  status: EntryStatus;
  postponedTo: LocalDate | null;
  values: Record<string, FieldValue>;
  fieldSnapshot: FieldSnapshot[];
  habitNameSnapshot: string;
  note: string;
  /** Subjective exertion 1–10 (training only, optional) */
  rpe: number | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PhaseChange {
  id: string;
  habitId: string;
  fromPhase: Phase;
  toPhase: Phase;
  reason: 'user' | 'suggestion_accepted';
  createdAt: string;
}

export type HabitInput = Omit<Habit, 'id' | 'createdAt' | 'updatedAt' | 'phaseSuggestionDismissedUntil' | 'kind' | 'reminderAnchor' | 'reminderOffsetMin'> & {
  phaseSuggestionDismissedUntil?: LocalDate | null;
  kind?: HabitKind;
  reminderAnchor?: ReminderAnchor | null;
  reminderOffsetMin?: number;
};

export type FieldInput = Omit<FieldDefinition, 'id' | 'habitId'> & { id?: string };

export interface EntryInput {
  habitId: string;
  localDate: LocalDate;
  status: EntryStatus;
  postponedTo?: LocalDate | null;
  values?: Record<string, FieldValue>;
  note?: string;
  rpe?: number | null;
}

export const PHASES: Phase[] = [1, 2, 3, 4, 5];

export const DEFAULT_PROFILE: Profile = {
  displayName: '',
  goals: [],
  habitBacklog: [],
  mode: 'guided',
  locale: 'de',
  timezone: 'Europe/Berlin',
  defaultReminderTime: null,
  phaseThreshold: 0.8,
  phaseWindowDays: 14,
  onboardingCompleted: false,
  trainingLevel: null,
  trainingGoals: [],
  startPreference: null,
  trainingDays: [],
  trainingSettings: [],
  trainingLimitations: '',
  communicationStyle: 'supportive',
  features: { detailedLogging: false, rpe: false, cycles: false, checkin: false },
  healthConsentAt: null,
  dayRhythm: 'standard',
  anchors: { wake: '07:00', firstMeal: '08:00', workEnd: '17:00', bedtime: '23:00' },
  dayStartHour: 3,
  stepSettings: { goal: 8000, autoHabits: [] },
};

/** Fills fields added in later versions so data stored by older versions keeps working. */
export function normalizeProfile(p: Partial<Profile> | null | undefined): Profile {
  const base = { ...DEFAULT_PROFILE, ...(p ?? {}) };
  return {
    ...base,
    features: { ...DEFAULT_PROFILE.features, ...(p?.features ?? {}) },
    anchors: { ...DEFAULT_PROFILE.anchors, ...(p?.anchors ?? {}) },
    stepSettings: { ...DEFAULT_PROFILE.stepSettings, ...(p?.stepSettings ?? {}) },
  };
}

export function normalizeHabit<T extends Partial<Habit>>(h: T): T & Pick<Habit, 'kind' | 'reminderAnchor' | 'reminderOffsetMin' | 'pausePeriods'> {
  return { ...h, kind: h.kind ?? 'habit', reminderAnchor: h.reminderAnchor ?? null, reminderOffsetMin: h.reminderOffsetMin ?? 0, pausePeriods: h.pausePeriods ?? [] };
}

export const PLAN_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/heic', 'image/webp'] as const;
export type PlanMimeType = (typeof PLAN_MIME_TYPES)[number];
export const PLAN_MAX_BYTES = 10 * 1024 * 1024;

/** Uploaded existing training plan (photo / PDF), stored privately. */
export interface TrainingPlan {
  id: string;
  title: string;
  storagePath: string;
  mimeType: PlanMimeType;
  sizeBytes: number;
  note: string;
  createdAt: string;
}

export interface PlanUploadInput {
  title: string;
  fileName: string;
  mimeType: string;
  bytes: ArrayBuffer;
}

/** One-off task to tick off once (unlike a recurring habit). Never counted in habit rates. */
export interface Todo {
  id: string;
  title: string;
  /** optional due day; null = whenever */
  dueDate: LocalDate | null;
  /** ISO timestamp when ticked off; null = open */
  doneAt: string | null;
  note: string;
  createdAt: string;
  updatedAt: string;
}

export type TodoInput = Pick<Todo, 'title' | 'dueDate' | 'note'>;
