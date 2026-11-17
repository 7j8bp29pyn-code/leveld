import { addDays, diffDays, eachDay, isLocalDate, isoWeekday, normalizeTime, startOfIsoWeek, toLocalDate } from '../dates';

describe('dates', () => {
  it('validates calendar dates', () => {
    expect(isLocalDate('2026-02-28')).toBe(true);
    expect(isLocalDate('2026-02-29')).toBe(false);
    expect(isLocalDate('2028-02-29')).toBe(true);
    expect(isLocalDate('2026-1-01')).toBe(false);
  });

  it('adds days across month, year and DST boundaries', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-29', 1)).toBe('2026-03-30'); // EU DST switch
    expect(addDays('2026-10-25', 1)).toBe('2026-10-26');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(diffDays('2026-03-28', '2026-03-31')).toBe(3);
  });

  it('computes ISO weekdays and week starts', () => {
    expect(isoWeekday('2026-11-16')).toBe(1); // Monday
    expect(isoWeekday('2026-11-22')).toBe(7); // Sunday
    expect(startOfIsoWeek('2026-11-22')).toBe('2026-11-16');
    expect(eachDay('2026-11-16', '2026-11-18')).toEqual(['2026-11-16', '2026-11-17', '2026-11-18']);
    expect(eachDay('2026-11-18', '2026-11-16')).toEqual([]);
  });

  it('uses the local calendar day, not UTC', () => {
    const lateEvening = new Date(2026, 10, 17, 23, 59);
    expect(toLocalDate(lateEvening)).toBe('2026-11-17');
  });

  it('normalises user time input', () => {
    expect(normalizeTime('7')).toBe('07:00');
    expect(normalizeTime('730')).toBe('07:30');
    expect(normalizeTime('22.15')).toBe('22:15');
    expect(normalizeTime('24:00')).toBeNull();
    expect(normalizeTime('abc')).toBeNull();
  });
});
