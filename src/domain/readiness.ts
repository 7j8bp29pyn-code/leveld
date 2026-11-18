import type { DailyCheckin, Symptom } from './types';

/**
 * Rule-based daily readiness assessment.
 *
 * IMPORTANT: These rules are a transparent, conservative orientation aid – NOT a medical
 * diagnosis and NOT a training clearance. They are documented in docs/HEALTH-RULES.md and
 * must be reviewed by qualified professionals before productive use.
 *
 * The state is derived ONLY from what the user stated today. Sleep, stress and soreness
 * are shown but never turned into an automatic judgement (insufficient data).
 * The long-term training level is deliberately NOT an input here.
 */
export type ReadinessState = 'A' | 'B' | 'C' | 'D';

export type TrainingOption =
  | 'as_planned' // do the original session
  | 'lighter' // lighter session → status "adapted"
  | 'mobility' // mobility / active recovery → status "recovery"
  | 'rest' // rest day → status "recovery"
  | 'postpone' // move to another day
  | 'health_pause'; // suspend for health reasons

export type AdviceKey =
  | 'urgent_medical' // red flags → seek urgent medical help
  | 'fever_rest' // fever → advise against training
  | 'symptoms_conservative' // sore throat / cough / other symptoms
  | 'medical_if_unclear' // unclear complaints → get checked
  | 'recovery_emphasis' // strongly exhausted
  | 'tired_options' // slightly tired
  | 'pain_hint' // pain / injury
  | 'soreness_hint'; // strong muscle soreness (informational only)

export interface Assessment {
  state: ReadinessState;
  urgent: boolean;
  advice: AdviceKey[];
  /** Options in recommended order */
  options: TrainingOption[];
  /** No automatic load increase / phase-up suggestions for training today */
  suppressProgression: boolean;
}

const SYSTEMIC_OR_ILLNESS: Symptom[] = ['sore_throat', 'cough', 'other_symptoms'];

export function assessReadiness(c: DailyCheckin | null | undefined): Assessment | null {
  if (!c) return null; // no check-in → no assumptions, plan stays as it is

  if (c.redFlags.length > 0) {
    return { state: 'D', urgent: true, advice: ['urgent_medical'], options: ['health_pause'], suppressProgression: true };
  }
  if (c.symptoms.includes('fever')) {
    return {
      state: 'D', urgent: false, advice: ['fever_rest', 'medical_if_unclear'],
      options: ['health_pause', 'rest'], suppressProgression: true,
    };
  }
  if (c.readiness === 'sick' || c.symptoms.some((s) => SYSTEMIC_OR_ILLNESS.includes(s))) {
    return {
      state: 'D', urgent: false, advice: ['symptoms_conservative', 'medical_if_unclear'],
      options: ['health_pause', 'rest', 'postpone'], suppressProgression: true,
    };
  }

  const extra: AdviceKey[] = [];
  const pain = c.symptoms.includes('pain_injury');
  if (pain) extra.push('pain_hint', 'medical_if_unclear');
  if ((c.soreness ?? 0) >= 3) extra.push('soreness_hint');

  if (c.readiness === 'exhausted') {
    return {
      state: 'C', urgent: false, advice: ['recovery_emphasis', ...extra],
      options: ['rest', 'mobility', 'lighter', 'postpone', 'as_planned'], suppressProgression: true,
    };
  }
  if (c.readiness === 'tired' || pain) {
    return {
      state: 'B', urgent: false, advice: [...(c.readiness === 'tired' ? ['tired_options' as const] : []), ...extra],
      options: ['as_planned', 'lighter', 'mobility', 'postpone'], suppressProgression: true,
    };
  }
  return { state: 'A', urgent: false, advice: extra, options: ['as_planned'], suppressProgression: false };
}

/** Maps a chosen option to the entry status that is stored. */
export function statusForOption(o: TrainingOption): 'done' | 'adapted' | 'recovery' | 'postponed' | 'health_pause' {
  switch (o) {
    case 'as_planned': return 'done';
    case 'lighter': return 'adapted';
    case 'mobility':
    case 'rest': return 'recovery';
    case 'postpone': return 'postponed';
    case 'health_pause': return 'health_pause';
  }
}
