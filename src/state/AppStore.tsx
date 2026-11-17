import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { LocalRepository } from '../data/localRepository';
import type { Repository, Snapshot } from '../data/repository';
import { SupabaseRepository } from '../data/supabaseRepository';
import { addDays, toLocalDate } from '../domain/dates';
import { ValidationError } from '../domain/entries';
import { DISMISS_DAYS } from '../domain/phases';
import { DEFAULT_PROFILE } from '../domain/types';
import type { EntryInput, FieldInput, HabitEntry, HabitInput, LocalDate, Phase, Profile } from '../domain/types';
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
  kind: 'error' | 'info';
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
}

const Ctx = createContext<Store | null>(null);

const emptySnapshot = (): Snapshot => ({
  profile: { ...DEFAULT_PROFILE },
  habits: [], fields: [], entries: [], phaseChanges: [],
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
  const [today, setToday] = useState(toLocalDate());
  const [toast, setToast] = useState<Toast | null>(null);

  const showToast = useCallback((message: string, kind: Toast['kind'] = 'error', action?: Toast['action']) => {
    setToast({ id: Date.now(), message, kind, action });
  }, []);

  // keep "today" correct across midnight and when app returns to foreground
  useEffect(() => {
    const tick = () => setToday((prev) => (prev === toLocalDate() ? prev : toLocalDate()));
    const iv = setInterval(tick, 30_000);
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

  // keep local reminders in sync with habit configuration
  const reminderSig = data.habits.map((h) => `${h.id}${h.status}${h.reminderEnabled}${h.reminderTime}${h.scheduleType}${h.weekdays.join()}${h.name}`).join('|');
  useEffect(() => {
    if (status !== 'ready') return;
    syncReminders(dataRef.current.habits, (h) => h.name, (h) => h.goal || i18n.t('today.reminderBody')).catch((e) => console.warn('reminders', e));
  }, [reminderSig, status]);

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

  const store: Store = {
    status, data, today, toast, repoKind: repo?.kind ?? 'local',
    email: auth.status === 'signedIn' ? auth.session.user.email ?? null : null,
    dismissToast: () => setToast(null),
    showToast,
    reload,

    async saveProfile(patch) {
      const next = { ...dataRef.current.profile, ...patch };
      const saved = await run((r) => r.saveProfile(next));
      if (saved) setData((d) => ({ ...d, profile: saved }));
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
      const saved = await run((r) => r.upsertEntry(input));
      if (!saved) return false;
      setData((d) => ({ ...d, entries: replaceEntry(d.entries, input.habitId, input.localDate, saved) }));
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
        habitNameSnapshot: habit.name, note: '', completedAt: now, createdAt: now, updatedAt: now,
      };
      setData((d) => ({ ...d, entries: replaceEntry(d.entries, habitId, date, optimistic) }));
      const saved = await run((r) => r.upsertEntry({ habitId, localDate: date, status: 'done' }));
      setData((d) => ({ ...d, entries: replaceEntry(d.entries, habitId, date, saved ?? existing ?? null) }));
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
  };

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error('useStore outside AppStoreProvider');
  return s;
}
