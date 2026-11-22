import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { LocalRepository } from '../data/localRepository';
import type { Repository, Snapshot } from '../data/repository';
import { SupabaseRepository } from '../data/supabaseRepository';
import { addDays, toLocalDate } from '../domain/dates';
import { isComeback, feedbackFor } from '../domain/motivation';
import { logicalDate } from '../domain/rhythm';
import { ValidationError } from '../domain/entries';
import { DISMISS_DAYS } from '../domain/phases';
import { DEFAULT_PROFILE } from '../domain/types';
import type {
  CheckinInput, CycleInput, DayScheduleInput, EntryInput, FieldInput, HabitEntry, HabitInput, LocalDate, Phase, PlanUploadInput, Profile, TodoInput, TrainingPlan,
} from '../domain/types';
import i18n from '../i18n';
import { newId } from '../services/ids';
import { getSupabase } from '../services/supabase';
import { syncReminders } from '../services/notifications';
import type { AuthState } from '../services/auth';

/** How much history is kept in memory for dashboard/statistics. */
export const HISTORY_DAYS = 400;

type Status = 'loading' | 'ready' | 'error';

export interface Toast {
  id: number;
  message: string;
  kind: 'error' | 'info' | 'success';
  action?: { label: string; run: () => void };
}

interface Store {
  status: Status;
  data: Snapshot;
  today: LocalDate;
  repoKind: 'local' | 'supabase';
  email: string | null;
  toast: Toast | null;
  dismissToast(): void;
  showToast(message: string, kind?: Toast['kind'], action?: Toast['action']): void;
  reload(): Promise<void>;
  saveProfile(patch: Partial<Profile>): Promise<boolean>;
  createHabit(input: HabitInput, fields: FieldInput[]): Promise<string | null>;
  updateHabit(id: string, patch: Partial<HabitInput>, fields?: FieldInput[]): Promise<boolean>;
  deleteHabit(id: string): Promise<boolean>;
  setEntry(input: EntryInput): Promise<boolean>;
  clearEntry(habitId: string, date: LocalDate): Promise<boolean>;
  toggleDone(habitId: string, date: LocalDate): Promise<void>;
  changePhase(habitId: string, to: Phase, reason: 'user' | 'suggestion_accepted'): Promise<boolean>;
  dismissSuggestion(habitId: string): Promise<void>;
  pauseHabit(habitId: string): Promise<boolean>;
  resumeHabit(habitId: string): Promise<boolean>;
  deleteAllData(): Promise<boolean>;
  exportAll(): Promise<Snapshot>;
  saveCheckin(input: CheckinInput): Promise<boolean>;
  deleteCheckin(date: LocalDate): Promise<boolean>;
  /** Withdraws health consent: switches the check-in off and deletes all stored check-ins. */
  withdrawHealthConsent(): Promise<boolean>;
  saveCycle(input: CycleInput, id?: string): Promise<boolean>;
  deleteCycle(id: string): Promise<boolean>;
  saveDaySchedule(input: DayScheduleInput): Promise<boolean>;
  deleteDaySchedule(date: LocalDate): Promise<boolean>;
  uploadPlan(input: PlanUploadInput): Promise<boolean>;
  openPlanUrl(plan: TrainingPlan): Promise<string | null>;
  deletePlan(plan: TrainingPlan): Promise<boolean>;
  saveTodo(input: TodoInput, id?: string): Promise<boolean>;
  /** One-tap tick off / reopen with optimistic UI. */
  toggleTodo(id: string): Promise<void>;
  deleteTodo(id: string): Promise<boolean>;
}

const Ctx = createContext<Store | null>(null);

const emptySnapshot = (): Snapshot => ({
  profile: { ...DEFAULT_PROFILE },
  habits: [], fields: [], entries: [], phaseChanges: [], checkins: [], cycles: [], daySchedules: [], trainingPlans: [], todos: [],
});

export function errorMessage(e: unknown): string {
  if (e instanceof ValidationError) return i18n.t(`errors.${e.message}`, { defaultValue: e.message });
  const msg = e instanceof Error ? e.message : String(e);
  if (/network|fetch/i.test(msg)) return i18n.t('errors.network');
  if (i18n.exists(`errors.${msg}`)) return i18n.t(`errors.${msg}`);
  return i18n.t('errors.saveFailed', { msg });
}

function makeRepo(auth: AuthState): Repository | null {
  if (auth.status === 'local') return new LocalRepository(AsyncStorage, newId);
  if (auth.status === 'signedIn') return new SupabaseRepository(getSupabase(), newId);
  return null;
}

export function AppStoreProvider({ auth, children }: { auth: AuthState; children: React.ReactNode }) {
  const userKey = auth.status === 'signedIn' ? auth.session.user.id : auth.status;
  const repo = useMemo(() => makeRepo(auth), [userKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const [status, setStatus] = useState<Status>('loading');
  const [data, setData] = useState<Snapshot>(emptySnapshot);
  const dataRef = useRef(data);
  useLayoutEffect(() => { dataRef.current = data; }, [data]);
  const dayStartHour = data.profile.dayStartHour ?? 3;
  const [clock, setClock] = useState(() => Date.now());
  const today = logicalDate(new Date(clock), dayStartHour);
  const [toast, setToast] = useState<Toast | null>(null);

  const showToast = useCallback((message: string, kind: Toast['kind'] = 'error', action?: Toast['action']) => {
    setToast({ id: Date.now(), message, kind, action });
  }, []);

  // keep "today" correct across midnight and when app returns to foreground
  useEffect(() => {
    const tick = () => setClock(Date.now());
    const iv = setInterval(tick, 60_000);
    const sub = AppState.addEventListener('change', (s) => s === 'active' && tick());
    return () => { clearInterval(iv); sub.remove(); };
  }, []);

  const [loadNonce, setLoadNonce] = useState(0);
  const reload = useCallback(async () => {
    setStatus('loading');
    setLoadNonce((n) => n + 1);
  }, []);

  useEffect(() => {
    if (!repo) return;
    let cancelled = false;
    repo.load(addDays(toLocalDate(), -HISTORY_DAYS)).then(
      (snap) => {
        if (cancelled) return;
        dataRef.current = snap;
        setData(snap);
        setStatus('ready');
      },
      (e) => {
        console.warn('load failed', e);
        if (!cancelled) setStatus('error');
      },
    );
    return () => { cancelled = true; };
  }, [repo, loadNonce]);

  useEffect(() => {
    if (status === 'ready') i18n.changeLanguage(data.profile.locale);
  }, [status, data.profile.locale]);

  // keep local reminders in sync with habit configuration, day rhythm and shift plan (re-planned daily)
  const reminderSig = [
    today,
    JSON.stringify(data.profile.anchors), data.profile.dayStartHour,
    data.daySchedules.map((d) => d.localDate + JSON.stringify(d.anchors)).join(),
    data.habits.map((h) => `${h.id}${h.status}${h.reminderEnabled}${h.reminderTime}${h.reminderAnchor}${h.reminderOffsetMin}${h.scheduleType}${h.weekdays.join()}${h.name}${h.pausePeriods.length}`).join('|'),
  ].join('#');
  useEffect(() => {
    if (status !== 'ready') return;
    const d = dataRef.current;
    syncReminders(d.habits, d.profile, d.daySchedules, today, (h) => h.name, (h) => h.goal || i18n.t('today.reminderBody'))
      .catch((e) => console.warn('reminders', e));
  }, [reminderSig, status]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Runs a repository call; shows a toast on error. */
  const run = useCallback(async <T,>(fn: (r: Repository) => Promise<T>): Promise<T | undefined> => {
    if (!repo) return undefined;
    try {
      return await fn(repo);
    } catch (e) {
      showToast(errorMessage(e));
      return undefined;
    }
  }, [repo, showToast]);

  const replaceEntry = (entries: HabitEntry[], habitId: string, date: LocalDate, next: HabitEntry | null) => {
    const rest = entries.filter((e) => !(e.habitId === habitId && e.localDate === date));
    return next ? [...rest, next] : rest;
  };

  /** Positive, style-dependent confirmation – never pressure, never shaming. */
  const giveFeedback = (habitId: string, st: HabitEntry['status'], date: LocalDate, entriesBefore: HabitEntry[]) => {
    const habit = dataRef.current.habits.find((h) => h.id === habitId);
    if (!habit) return;
    const fb = feedbackFor(dataRef.current.profile.communicationStyle, habit, st, isComeback(habit, entriesBefore, date), Math.random() * 3);
    if (fb) showToast(i18n.t(fb.key, fb.params), 'success');
  };

  const store: Store = {
    status, data, today, toast, repoKind: repo?.kind ?? 'local',
    email: auth.status === 'signedIn' ? auth.session.user.email ?? null : null,
    dismissToast: () => setToast(null),
    showToast,
    reload,

    async saveProfile(patch) {
      const next = { ...dataRef.current.profile, ...patch };
      const saved = await run((r) => r.saveProfile(next));
      if (saved) {
        // keep the ref current immediately so a following save never merges into stale data
        dataRef.current = { ...dataRef.current, profile: saved };
        setData((d) => ({ ...d, profile: saved }));
      }
      return !!saved;
    },

    async createHabit(input, fields) {
      const res = await run((r) => r.createHabit(input, fields));
      if (!res) return null;
      setData((d) => ({ ...d, habits: [...d.habits, res.habit], fields: [...d.fields, ...res.fields] }));
      return res.habit.id;
    },

    async updateHabit(id, patch, fields) {
      const res = await run((r) => r.updateHabit(id, patch, fields));
      if (!res) return false;
      setData((d) => ({
        ...d,
        habits: d.habits.map((h) => (h.id === id ? res.habit : h)),
        fields: fields ? [...d.fields.filter((f) => f.habitId !== id), ...res.fields] : d.fields,
      }));
      return true;
    },

    async deleteHabit(id) {
      const ok = await run((r) => r.deleteHabit(id).then(() => true));
      if (ok) setData((d) => ({
        ...d,
        habits: d.habits.filter((h) => h.id !== id),
        fields: d.fields.filter((f) => f.habitId !== id),
        entries: d.entries.filter((e) => e.habitId !== id),
        phaseChanges: d.phaseChanges.filter((c) => c.habitId !== id),
      }));
      return !!ok;
    },

    async setEntry(input) {
      const before = dataRef.current.entries;
      const saved = await run((r) => r.upsertEntry(input));
      if (!saved) return false;
      setData((d) => ({ ...d, entries: replaceEntry(d.entries, input.habitId, input.localDate, saved) }));
      giveFeedback(input.habitId, input.status, input.localDate, before);
      return true;
    },

    async clearEntry(habitId, date) {
      const ok = await run((r) => r.deleteEntry(habitId, date).then(() => true));
      if (ok) setData((d) => ({ ...d, entries: replaceEntry(d.entries, habitId, date, null) }));
      return !!ok;
    },

    /** One-tap check/uncheck with optimistic UI and rollback on failure. Non-done entries become done. */
    async toggleDone(habitId, date) {
      const before = dataRef.current.entries;
      const existing = before.find((e) => e.habitId === habitId && e.localDate === date);
      const habit = dataRef.current.habits.find((h) => h.id === habitId);
      if (!habit) return;
      if (existing?.status === 'done') {
        setData((d) => ({ ...d, entries: replaceEntry(d.entries, habitId, date, null) }));
        const ok = await run((r) => r.deleteEntry(habitId, date).then(() => true));
        if (!ok) setData((d) => ({ ...d, entries: replaceEntry(d.entries, habitId, date, existing) }));
        return;
      }
      const now = new Date().toISOString();
      const optimistic: HabitEntry = {
        id: existing?.id ?? `tmp-${habitId}-${date}`, habitId, localDate: date, status: 'done', postponedTo: null, values: {}, fieldSnapshot: [],
        habitNameSnapshot: habit.name, note: '', rpe: null, completedAt: now, createdAt: now, updatedAt: now,
      };
      setData((d) => ({ ...d, entries: replaceEntry(d.entries, habitId, date, optimistic) }));
      const saved = await run((r) => r.upsertEntry({ habitId, localDate: date, status: 'done' }));
      setData((d) => ({ ...d, entries: replaceEntry(d.entries, habitId, date, saved ?? existing ?? null) }));
      if (saved) giveFeedback(habitId, 'done', date, before);
    },

    async changePhase(habitId, to, reason) {
      const habit = dataRef.current.habits.find((h) => h.id === habitId);
      if (!habit || habit.phase === to) return true;
      const res = await run(async (r) => {
        const u = await r.updateHabit(habitId, { phase: to, phaseSuggestionDismissedUntil: null });
        const c = await r.addPhaseChange({ habitId, fromPhase: habit.phase, toPhase: to, reason });
        return { u, c };
      });
      if (!res) return false;
      setData((d) => ({
        ...d,
        habits: d.habits.map((h) => (h.id === habitId ? res.u.habit : h)),
        phaseChanges: [...d.phaseChanges, res.c],
      }));
      return true;
    },

    async dismissSuggestion(habitId) {
      await store.updateHabit(habitId, { phaseSuggestionDismissedUntil: addDays(today, DISMISS_DAYS) });
    },

    async pauseHabit(habitId) {
      const h = dataRef.current.habits.find((x) => x.id === habitId);
      if (!h || h.status === 'paused') return false;
      return store.updateHabit(habitId, { status: 'paused', pausePeriods: [...h.pausePeriods, { start: today, end: null }] });
    },

    async resumeHabit(habitId) {
      const h = dataRef.current.habits.find((x) => x.id === habitId);
      if (!h) return false;
      const periods = h.pausePeriods
        .map((p) => (p.end === null ? { ...p, end: addDays(today, -1) } : p))
        .filter((p) => p.end! >= p.start); // paused & resumed on the same day → no period
      return store.updateHabit(habitId, { status: 'active', pausePeriods: periods });
    },

    async deleteAllData() {
      const ok = await run((r) => r.deleteAllData().then(() => true));
      if (ok) {
        setData(emptySnapshot());
        await reload();
      }
      return !!ok;
    },

    async exportAll() {
      if (!repo) return emptySnapshot();
      return repo.exportAll();
    },

    async saveCheckin(input) {
      const saved = await run((r) => r.upsertCheckin(input));
      if (saved) setData((d) => ({ ...d, checkins: [...d.checkins.filter((c) => c.localDate !== saved.localDate), saved] }));
      return !!saved;
    },

    async deleteCheckin(date) {
      const ok = await run((r) => r.deleteCheckin(date).then(() => true));
      if (ok) setData((d) => ({ ...d, checkins: d.checkins.filter((c) => c.localDate !== date) }));
      return !!ok;
    },

    async withdrawHealthConsent() {
      const ok = await run((r) => r.deleteAllCheckins().then(() => true));
      if (!ok) return false;
      setData((d) => ({ ...d, checkins: [] }));
      return store.saveProfile({ healthConsentAt: null, features: { ...dataRef.current.profile.features, checkin: false } });
    },

    async saveCycle(input, id) {
      const saved = await run((r) => r.saveCycle(input, id));
      if (saved) setData((d) => ({ ...d, cycles: [...d.cycles.filter((c) => c.id !== saved.id), saved] }));
      return !!saved;
    },

    async deleteCycle(id) {
      const ok = await run((r) => r.deleteCycle(id).then(() => true));
      if (ok) setData((d) => ({ ...d, cycles: d.cycles.filter((c) => c.id !== id) }));
      return !!ok;
    },

    async saveDaySchedule(input) {
      const saved = await run((r) => r.upsertDaySchedule(input));
      if (saved) setData((d) => ({ ...d, daySchedules: [...d.daySchedules.filter((x) => x.localDate !== saved.localDate), saved] }));
      return !!saved;
    },

    async saveTodo(input, id) {
      const saved = await run((r) => r.saveTodo(input, id));
      if (saved) setData((d) => ({ ...d, todos: [...d.todos.filter((x) => x.id !== saved.id), saved] }));
      return !!saved;
    },

    async toggleTodo(id) {
      const before = dataRef.current.todos.find((x) => x.id === id);
      if (!before) return;
      const done = !before.doneAt;
      const optimistic = { ...before, doneAt: done ? new Date().toISOString() : null };
      setData((d) => ({ ...d, todos: d.todos.map((x) => (x.id === id ? optimistic : x)) }));
      const saved = await run((r) => r.setTodoDone(id, done));
      setData((d) => ({ ...d, todos: d.todos.map((x) => (x.id === id ? saved ?? before : x)) }));
      if (saved && done) {
        const style = dataRef.current.profile.communicationStyle;
        showToast(i18n.t(`motivation.${style}.done.${Math.floor(Math.random() * 3)}`, { name: saved.title }), 'success');
      }
    },

    async deleteTodo(id) {
      const ok = await run((r) => r.deleteTodo(id).then(() => true));
      if (ok) setData((d) => ({ ...d, todos: d.todos.filter((x) => x.id !== id) }));
      return !!ok;
    },

    async uploadPlan(input) {
      const saved = await run((r) => r.uploadPlan(input));
      if (saved) setData((d) => ({ ...d, trainingPlans: [saved, ...d.trainingPlans] }));
      return !!saved;
    },

    async openPlanUrl(plan) {
      return (await run((r) => r.planUrl(plan))) ?? null;
    },

    async deletePlan(plan) {
      const ok = await run((r) => r.deletePlan(plan).then(() => true));
      if (ok) setData((d) => ({ ...d, trainingPlans: d.trainingPlans.filter((x) => x.id !== plan.id) }));
      return !!ok;
    },

    async deleteDaySchedule(date) {
      const ok = await run((r) => r.deleteDaySchedule(date).then(() => true));
      if (ok) setData((d) => ({ ...d, daySchedules: d.daySchedules.filter((x) => x.localDate !== date) }));
      return !!ok;
    },
  };

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error('useStore outside AppStoreProvider');
  return s;
}
