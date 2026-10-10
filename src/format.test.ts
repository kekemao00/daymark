import { describe, expect, it } from 'vitest';
import { daysLabel, groupUpcoming, matches, offsetLabel, shortDate, solarMaxDay } from './format';
import type { DayEvent, Upcoming } from './types';

const up = (eventId: string, daysUntil: number): Upcoming => ({
  eventId,
  daysUntil,
  date: '2026-10-10',
  weekday: '周六',
  lunarLabel: null,
  ruleLabel: '',
  countLabel: null,
});

const ev = (over: Partial<DayEvent>): DayEvent => ({
  id: '1',
  name: '妈妈生日',
  category: 'birthday',
  calendar: 'lunar',
  month: 9,
  day: 6,
  leap: false,
  year: null,
  offsets: [30, 7, 0],
  note: '喜欢兰花',
  enabled: true,
  createdAt: '',
  updatedAt: '',
  remindFrom: '2026-10-10',
  ...over,
});

describe('format', () => {
  it('labels days', () => {
    expect([0, 1, 2, 16].map(daysLabel)).toEqual(['今天', '明天', '后天', '16 天']);
  });

  it('labels offsets', () => {
    expect([30, 7, 3, 0].map(offsetLabel)).toEqual(['提前 1 个月', '提前 1 周', '提前 3 天', '当天']);
  });

  it('formats dates relative to this year', () => {
    expect(shortDate('2026-10-15', '2026-10-10')).toBe('10月15日');
    expect(shortDate('2027-02-08', '2026-10-10')).toBe('2027年2月8日');
  });

  it('allows Feb 29', () => {
    expect(solarMaxDay(2)).toBe(29);
    expect(solarMaxDay(4)).toBe(30);
  });

  it('groups upcoming by distance', () => {
    const sections = groupUpcoming([up('a', 0), up('b', 3), up('c', 7), up('d', 20), up('e', 200)]);
    expect(sections.map((s) => [s.key, s.items.map((i) => i.eventId).join('')])).toEqual([
      ['today', 'a'],
      ['week', 'bc'],
      ['month', 'd'],
      ['later', 'e'],
    ]);
  });

  it('filters by category and text', () => {
    expect(matches(ev({}), 'all', '兰花')).toBe(true);
    expect(matches(ev({}), 'anniversary', '')).toBe(false);
    expect(matches(ev({ category: 'memorial' }), 'others', '')).toBe(true);
    expect(matches(ev({}), 'all', '爸爸')).toBe(false);
  });
});
