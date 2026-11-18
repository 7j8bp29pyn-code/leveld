import { assessReadiness, statusForOption } from '../readiness';
import type { DailyCheckin } from '../types';

const ci = (over: Partial<DailyCheckin> = {}): DailyCheckin => ({
  id: 'c', localDate: '2026-11-18', readiness: 'fit', sleepHours: null, sleepQuality: null, stress: null, soreness: null,
  symptoms: [], redFlags: [], note: '', createdAt: '', updatedAt: '', ...over,
});

describe('assessReadiness', () => {
  it('makes no assumptions without a check-in', () => {
    expect(assessReadiness(null)).toBeNull();
  });

  it('A: fit → training as planned, progression allowed', () => {
    expect(assessReadiness(ci())).toMatchObject({ state: 'A', options: ['as_planned'], suppressProgression: false });
  });

  it('B: slightly tired → original, lighter, mobility, postpone; no progression', () => {
    const a = assessReadiness(ci({ readiness: 'tired' }))!;
    expect(a.state).toBe('B');
    expect(a.options).toEqual(['as_planned', 'lighter', 'mobility', 'postpone']);
    expect(a.suppressProgression).toBe(true);
  });

  it('C: strongly exhausted → rest is offered first', () => {
    const a = assessReadiness(ci({ readiness: 'exhausted' }))!;
    expect(a.state).toBe('C');
    expect(a.options[0]).toBe('rest');
    expect(a.advice).toContain('recovery_emphasis');
  });

  it('D: fever → advise against training, no "as planned" option', () => {
    const a = assessReadiness(ci({ readiness: 'fit', symptoms: ['fever'] }))!;
    expect(a.state).toBe('D');
    expect(a.options).not.toContain('as_planned');
    expect(a.advice).toEqual(['fever_rest', 'medical_if_unclear']);
  });

  it('D: sore throat / cough → conservative hint and medical check if unclear, no diagnosis', () => {
    for (const s of ['sore_throat', 'cough', 'other_symptoms'] as const) {
      const a = assessReadiness(ci({ symptoms: [s] }))!;
      expect(a.state).toBe('D');
      expect(a.advice).toEqual(['symptoms_conservative', 'medical_if_unclear']);
      expect(a.options).not.toContain('as_planned');
      expect(a.options).not.toContain('lighter');
    }
    expect(assessReadiness(ci({ readiness: 'sick' }))!.state).toBe('D');
  });

  it('red flags always win and require urgent medical attention', () => {
    const a = assessReadiness(ci({ readiness: 'fit', redFlags: ['chest_pain'] }))!;
    expect(a).toMatchObject({ state: 'D', urgent: true, advice: ['urgent_medical'], options: ['health_pause'] });
  });

  it('pain/injury lifts a fit day to B with a hint; soreness is only informational', () => {
    expect(assessReadiness(ci({ symptoms: ['pain_injury'] }))).toMatchObject({ state: 'B', advice: ['pain_hint', 'medical_if_unclear'] });
    expect(assessReadiness(ci({ soreness: 3 }))).toMatchObject({ state: 'A', advice: ['soreness_hint'] });
  });

  it('sleep and stress values never change the state on their own', () => {
    expect(assessReadiness(ci({ sleepHours: 3, sleepQuality: 1, stress: 5 }))!.state).toBe('A');
  });

  it('maps options to stored statuses', () => {
    expect(statusForOption('lighter')).toBe('adapted');
    expect(statusForOption('rest')).toBe('recovery');
    expect(statusForOption('mobility')).toBe('recovery');
    expect(statusForOption('health_pause')).toBe('health_pause');
  });
});
